// Phase 4 ui-research-review — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// (综述/文献综述/review/生成综述). The renderer shows a review panel: topic
// input + paper checkboxes (loaded via /research-paper/search) + generate
// button → POST /research-review/generate → polls GET /research-review/:id
// until SUCCESS → shows the markdown review.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-review",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var TRIGGER = /(综述|文献综述|生成综述|review)/i;

		// ── Definition: one-shot node on a triggering user message ──
		var reviewDefinition = {
			kind: "research-review",
			target: "chat",
			match: function (event) {
				if (event.type !== "user/message") return null;
				var content = event.data && event.data.content;
				var text = "";
				if (Array.isArray(content)) {
					for (var i = 0; i < content.length; i++) {
						if (content[i] && content[i].type === "text") text += content[i].text;
					}
				}
				if (!TRIGGER.test(text)) return null;
				return { id: String(event.seq), role: "start" };
			},
			start: function (_context, match) {
				var content = match.event.data && match.event.data.content;
				var text = "";
				if (Array.isArray(content)) {
					for (var i = 0; i < content.length; i++) {
						if (content[i] && content[i].type === "text") text += content[i].text;
					}
				}
				var m = TRIGGER.exec(text || "");
				var topic = "";
				if (m) topic = text.slice(m.index + m[0].length).replace(/^[:：,，\s]+/, "");
				return { at: match.event.seq, triggered: true, topic: topic };
			},
			update: function (context) { return context.state; },
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.triggered) return null;
				return {
					key: context.key,
					kind: "research-review",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.at,
					location: context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" },
					visibility: "visible",
					data: { topic: context.state.topic },
				};
			},
		};

		// ── Renderer: review generation panel ──
		function ReviewView(props) {
			var data = props.node.data || {};
			var topicState = React.useState(data.topic || "");
			var topic = topicState[0];
			var setTopic = topicState[1];
			var papersState = React.useState(null);
			var papers = papersState[0];
			var setPapers = papersState[1];
			var checkedState = React.useState({});
			var checked = checkedState[0];
			var setChecked = checkedState[1];
			var jobState = React.useState(null);
			var job = jobState[0];
			var setJob = jobState[1];

			React.useEffect(function () {
				var cancelled = false;
				fetch("/research-paper/search?q=&limit=50", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (cancelled || !j || j.code !== 0) { if (!cancelled) setPapers([]); return; }
						var items = j.data.items || [];
						var all = {};
						items.forEach(function (p) { all[String(p.id)] = true; });
						setPapers(items);
						setChecked(all);
					})
					.catch(function () { if (!cancelled) setPapers([]); });
				return function () { cancelled = true; };
			}, []);

			// Poll the review task until terminal.
			React.useEffect(function () {
				if (!job || !job.taskId || job.status === "SUCCESS" || job.status === "FAILED") return;
				var timer = setTimeout(function () {
					fetch("/research-review/" + job.taskId, { credentials: "include" })
						.then(function (r) { return r.json(); })
						.then(function (j) {
							if (j && j.code === 0) setJob({ taskId: job.taskId, status: j.data.status, result: j.data.result, error: j.data.error });
							else setJob({ taskId: job.taskId, status: "FAILED", result: null, error: (j && j.message) || "查询任务失败" });
						})
						.catch(function () { setJob({ taskId: job.taskId, status: "FAILED", result: null, error: "网络错误" }); });
				}, 3000);
				return function () { clearTimeout(timer); };
			}, [job]);

			var toggle = function (id) {
				return function () {
					var next = Object.assign({}, checked);
					next[id] = !next[id];
					setChecked(next);
				};
			};

			var onGenerate = function () {
				if (!topic.trim() || job) return;
				var ids = Object.keys(checked).filter(function (k) { return checked[k]; }).map(Number);
				if (!ids.length) return;
				setJob({ taskId: null, status: "STARTING", result: null, error: null });
				fetch("/research-review/generate", {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ paperIds: ids, topic: topic.trim() }),
				})
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (j && j.code === 0) setJob({ taskId: j.data.taskId, status: "PENDING", result: null, error: null });
						else setJob({ taskId: null, status: "FAILED", result: null, error: (j && j.message) || "创建任务失败" });
					})
					.catch(function () { setJob({ taskId: null, status: "FAILED", result: null, error: "网络错误" }); });
			};

			var inputStyle = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 8, border: "1px solid var(--dsw-border, #ddd)", fontSize: 13, fontFamily: "inherit", background: "var(--dsw-surface, #fff)", color: "var(--dsw-fg, #333)" };

			var paperList = null;
			if (papers !== null) {
				paperList = React.createElement("div", { style: { maxHeight: 180, overflowY: "auto", border: "1px solid var(--dsw-border, #eee)", borderRadius: 8, padding: 6 } },
					papers.length === 0
						? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)" } }, "暂无论文，请先上传/导入文献")
						: papers.map(function (p) {
							return React.createElement("label", { key: p.id, style: { display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 2px", fontSize: 12, cursor: "pointer" } },
								React.createElement("input", { type: "checkbox", checked: !!checked[String(p.id)], onChange: toggle(String(p.id)), style: { marginTop: 2 } }),
								React.createElement("span", null, p.title || "(no title)"),
							);
						}),
				);
			} else {
				paperList = React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)" } }, "加载论文中…");
			}

			var statusLine = null;
			if (job) {
				if (job.status === "SUCCESS") {
					var md = (job.result && (job.result.markdown || job.result.text)) || "";
					statusLine = React.createElement("div", { style: { marginTop: 8, padding: 10, borderRadius: 8, background: "var(--dsw-surface-2, #f7f7f7)", border: "1px solid var(--dsw-border, #eee)", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 320, overflowY: "auto" } }, md);
				} else if (job.status === "FAILED") {
					statusLine = React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#c0392b" } }, "生成失败：" + (job.error || ""));
				} else {
					statusLine = React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsw-fg-muted, #888)" } }, job.status === "STARTING" ? "创建任务…" : "综述生成中（RAG 检索 + LLM 写作，约 30-60s）…");
				}
			}

			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "📝 ResearchOS 综述生成"),
				React.createElement("div", { style: { marginBottom: 8 } },
					React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, "综述主题"),
					React.createElement("input", { value: topic, onChange: function (e) { setTopic(e.target.value); }, placeholder: "如：Acoustic classification of gibbon females", style: inputStyle }),
				),
				React.createElement("div", { style: { marginBottom: 8 } },
					React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, "选择论文（默认全选）"),
					paperList,
				),
				React.createElement("div", { style: { textAlign: "right" } },
					React.createElement("button", { onClick: onGenerate, disabled: !!job || !topic.trim() || (papers !== null && !Object.keys(checked).some(function (k) { return checked[k]; })), style: { padding: "6px 20px", borderRadius: 8, border: "none", background: "var(--dsw-accent, #2563eb)", color: "#fff", fontSize: 13, cursor: "pointer", opacity: job ? 0.6 : 1 } }, job ? "生成中…" : "生成综述"),
				),
				statusLine,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(reviewDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-review" },
					ReviewView,
				);
			});
		};

		return module.exports;
	}
});
