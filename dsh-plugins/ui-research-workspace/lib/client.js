// ResearchOS fusion — Research Workspace region (browser half, hand-built in
// the dsh client bundle format consumed by window.__ModuleLoader__).
//
// Registers into the patched `sidebar.research` hole and renders the research
// workspace stacked BELOW the workspace browser (工作区 upper / 研究区 lower).
//
// Design (per user): the region has a "研究区" section title and hosts ONLY
// the literature library. Clicking a paper shows its preview + Paper
// Intelligence Card + author info in the content area. Selecting one or more
// papers (checkbox multi-select) reveals a bottom action bar with 综述 / 写作.
// No login / subscription UI: on mount the region silently bootstraps an
// anonymous dev session (GET /research-auth/anon, env-gated); the permission
// model is untouched (real JWT + user_id filtering). Visual language follows
// the workspace browser.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-workspace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useCallback = React.useCallback;

		// ── helpers ──────────────────────────────────────────────────────
		function api(path, opts) {
			opts = opts || {};
			return fetch(path, Object.assign({ credentials: "include" }, opts))
				.then(function (r) { return r.json().catch(function () { return {}; }); });
		}
		function ok(j) { return j && j.code === 0; }
		var INSET = "var(--dsh-sidebar-inline-padding, 8px)";

		// ── shared styles (workspace-consistent) ─────────────────────────
		var S = {
			root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, paddingTop: 2, boxSizing: "border-box" },
			body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 " + INSET + " 4px", boxSizing: "border-box" },
			scroll: { flex: 1, minHeight: 0, overflowY: "auto", marginRight: -4 },
			// section title (mirrors the workspace browser's section header)
			section: { flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, height: 32, margin: "0 " + INSET + " 2px", boxSizing: "border-box", color: "var(--dsw-alias-label-secondary, #666)" },
			sectionLabel: { fontSize: 13, lineHeight: 20, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" },
			iconBtn: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: "none", borderRadius: "50%", padding: 0, background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary, #666)" },
			input: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, lineHeight: 18, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", outline: "none", marginBottom: 6 },
			row: { display: "flex", alignItems: "center", gap: 6, padding: "0 4px", height: 32, borderRadius: 8, cursor: "pointer", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: 18 },
			rowOn: { display: "flex", alignItems: "center", gap: 6, padding: "0 4px", height: 32, borderRadius: 8, cursor: "pointer", background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: 18 },
			rowText: { flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" },
			rowSub: { flex: "none", fontSize: 11, color: "var(--dsw-alias-label-tertiary, #999)" },
			label: { fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 4, display: "block" },
			inputWide: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, lineHeight: 18, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			textarea: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, lineHeight: 18, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", minHeight: 90, resize: "vertical", outline: "none" },
			btn: { padding: "5px 12px", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			btnPrimary: { padding: "5px 12px", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-accent-fill, #2563eb)", color: "#fff", cursor: "pointer" },
			muted: { fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-tertiary, #999)", margin: "8px 4px" },
			err: { fontSize: 12, lineHeight: 18, color: "#dc2626", margin: "6px 4px" },
			ok: { fontSize: 12, color: "#16a34a", margin: "6px 4px" },
			tag: { display: "inline-block", fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-secondary, #666)", margin: "0 4px 4px 0" },
			select: { padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			field: { marginBottom: 10 },
			text: { fontSize: 13, lineHeight: 1.55, color: "var(--dsw-alias-label-primary, #111)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" },
			// bottom action bar (appears when ≥1 paper selected)
			bar: { flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "6px " + INSET, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", boxSizing: "border-box" },
			barLabel: { flex: 1, minWidth: 0, fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
		};

		// Paper Intelligence Card detail (preview + card + author info).
		function PaperDetail(props) {
			var detail = props.detail, card = props.card;
			var fields = [["Abstract", card ? card.abstract : ""], ["Method", card ? card.method : ""], ["Finding", card ? card.finding : ""], ["Limitation", card ? card.limitation : ""], ["Future work", card ? card.future_work : ""]];
			return React.createElement("div", { style: { padding: "2px " + INSET + " 10px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", maxHeight: "45%", overflowY: "auto", marginTop: 2 } },
				React.createElement("p", { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: "8px 0 4px", color: "var(--dsw-alias-label-primary, #111)" } }, detail.title || "(untitled)"),
				React.createElement("p", { style: S.muted }, (detail.authors || "—") + (detail.year ? " · " + detail.year : "") + (detail.doi ? " · DOI: " + detail.doi : "")),
				card && Array.isArray(card.tags) && card.tags.length ? React.createElement("div", { style: { marginBottom: 6 } },
					card.tags.map(function (t, i) { return React.createElement("span", { key: i, style: S.tag }, (t.name || "") + (t.category ? " · " + t.category : "")); }),
				) : null,
				fields.map(function (f, i) {
					if (!f[1]) return null;
					return React.createElement("div", { key: i, style: S.field },
						React.createElement("span", { style: S.label }, f[0]),
						React.createElement("p", { style: S.text }, String(f[1])),
					);
				}),
				card ? null : React.createElement("p", { style: S.muted }, "（暂无 Paper Intelligence Card，可重新分析生成）"),
			);
		}

		// ── 文献库（唯一功能页）─────────────────────────────────────────
		function LibraryView(props) {
			var sel = props.sel, toggleSel = props.toggleSel, focus = props.focus, focused = props.focused;
			var [q, setQ] = useState("");
			var [items, setItems] = useState(null);
			var [detail, setDetail] = useState(null);
			var [card, setCard] = useState(null);
			var [unauth, setUnauth] = useState(false);
			var [err, setErr] = useState(null);
			var load = useCallback(function (query) {
				setErr(null); setUnauth(false);
				api("/research-paper/search?q=" + encodeURIComponent(query || "") + "&limit=50")
					.then(function (j) {
						if (j && j.code === 401) { setUnauth(true); setItems([]); return; }
						if (!ok(j)) { setErr(j.message || "文献加载失败"); setItems([]); return; }
						setItems(j.data.items || []);
					})
					.catch(function () { setErr("网络错误"); setItems([]); });
			}, []);
			useEffect(function () { load(""); }, [load]);
			useEffect(function () {
				if (focused == null) { setDetail(null); setCard(null); return; }
				setDetail(null); setCard(null);
				api("/research-paper/papers/" + focused).then(function (j) { if (ok(j)) setDetail(j.data); });
				api("/research-paper/papers/" + focused + "/card").then(function (j) { if (ok(j) && j.data) setCard(j.data); });
			}, [focused]);
			return React.createElement("div", { style: S.body },
				unauth ? React.createElement("p", { style: S.muted }, "未登录 — 研究功能需要 ResearchOS 账号") : null,
				React.createElement("input", { style: S.input, placeholder: "检索标题 / 作者 / DOI", value: q, onChange: function (e) { setQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") load(q); } }),
				err ? React.createElement("p", { style: S.err }, err) : null,
				React.createElement("div", { style: S.scroll },
					items == null ? React.createElement("p", { style: S.muted }, "加载中…")
						: items.length === 0 ? React.createElement("p", { style: S.muted }, "暂无文献")
						: items.map(function (it) {
							var on = focused === it.id;
							return React.createElement("div", { key: it.id, style: on ? S.rowOn : S.row, onClick: function () { focus(it.id); } },
								React.createElement("input", { type: "checkbox", checked: !!sel[it.id], onClick: function (e) { e.stopPropagation(); }, onChange: function (e) { toggleSel(it.id); } }),
								React.createElement("span", { style: S.rowText }, it.title || "(untitled)"),
								React.createElement("span", { style: S.rowSub }, it.year || ""),
							);
						}),
				),
				focused != null && detail ? React.createElement(PaperDetail, { detail: detail, card: card }) : null,
			);
		}

		// ── 综述生成（底部栏触发，使用已选论文）──────────────────────────
		function ReviewComposer(props) {
			var papers = props.papers, onBack = props.onBack;
			var [topic, setTopic] = useState("");
			var [taskId, setTaskId] = useState(null);
			var [markdown, setMarkdown] = useState(null);
			var [err, setErr] = useState(null);
			useEffect(function () {
				if (taskId == null) return;
				var timer = setInterval(function () {
					api("/research-review/" + taskId).then(function (j) {
						if (!ok(j)) return;
						var st = j.data && j.data.status;
						if (st === "SUCCESS") { clearInterval(timer); setMarkdown((j.data.result && j.data.result.markdown) || "(empty)"); }
						else if (st === "FAILED") { clearInterval(timer); setErr(j.data.error || "综述生成失败"); setTaskId(null); }
					});
				}, 3000);
				return function () { clearInterval(timer); };
			}, [taskId]);
			var generate = function () {
				if (!topic.trim()) { setErr("请输入综述主题"); return; }
				setErr(null); setMarkdown(null);
				api("/research-review/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paperIds: papers.map(function (p) { return p.id; }), topic: topic.trim() }) })
					.then(function (j) {
						if (!ok(j)) { setErr(j.message || "提交失败"); return; }
						setTaskId(j.data.taskId);
					});
			};
			return React.createElement("div", { style: S.body },
				React.createElement("div", { style: S.section, margin: 0 },
					React.createElement("span", { style: S.sectionLabel }, "生成综述 · 已选 " + papers.length + " 篇"),
					React.createElement("button", { style: S.iconBtn, title: "返回", onClick: onBack }, "←"),
				),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "主题"),
					React.createElement("input", { style: S.inputWide, placeholder: "如：Acoustic classification of gibbon vocalizations", value: topic, onChange: function (e) { setTopic(e.target.value); } }),
				),
				err ? React.createElement("p", { style: S.err }, err) : null,
				React.createElement("button", { style: S.btnPrimary, onClick: generate, disabled: taskId != null }, taskId != null ? "生成中…" : "生成综述"),
				taskId != null ? React.createElement("p", { style: S.muted }, "任务 #" + taskId + " 处理中…") : null,
				markdown ? React.createElement("div", { style: { marginTop: 8, flex: 1, minHeight: 0, overflowY: "auto" } },
					React.createElement("pre", { style: Object.assign({}, S.text, { fontFamily: "inherit", maxHeight: "100%" }) }, markdown),
				) : null,
			);
		}

		// ── 写作（底部栏触发）────────────────────────────────────────────
		var ACTIONS = [["polish", "润色"], ["expand", "扩写"], ["shorten", "缩写"], ["translate", "翻译"], ["rebuttal", "审稿回复"], ["cover_letter", "Cover Letter"]];
		function WritingComposer(props) {
			var onBack = props.onBack;
			var [text, setText] = useState("");
			var [action, setAction] = useState("polish");
			var [instruction, setInstruction] = useState("");
			var [result, setResult] = useState(null);
			var [err, setErr] = useState(null);
			var [busy, setBusy] = useState(false);
			var rewrite = function () {
				if (!text.trim()) { setErr("请输入文本"); return; }
				setBusy(true); setErr(null); setResult(null);
				var body = { text: text, action: action };
				if (instruction.trim()) body.instruction = instruction.trim();
				api("/research-writing/rewrite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
					.then(function (j) {
						if (!ok(j)) { setErr(j.message || "改写失败"); return; }
						setResult(j.data && j.data.text);
					})
					.finally(function () { setBusy(false); });
			};
			return React.createElement("div", { style: S.body },
				React.createElement("div", { style: S.section, margin: 0 },
					React.createElement("span", { style: S.sectionLabel }, "写作助手"),
					React.createElement("button", { style: S.iconBtn, title: "返回", onClick: onBack }, "←"),
				),
				React.createElement("textarea", { style: S.textarea, placeholder: "粘贴要处理的文本…", value: text, onChange: function (e) { setText(e.target.value); } }),
				React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", margin: "8px 0" } },
					React.createElement("select", { style: S.select, value: action, onChange: function (e) { setAction(e.target.value); } },
						ACTIONS.map(function (a) { return React.createElement("option", { key: a[0], value: a[0] }, a[1]); }),
					),
					React.createElement("button", { style: S.btnPrimary, onClick: rewrite, disabled: busy }, busy ? "处理中…" : "改写"),
				),
				React.createElement("input", { style: S.inputWide, placeholder: "附加指令（可选）", value: instruction, onChange: function (e) { setInstruction(e.target.value); } }),
				err ? React.createElement("p", { style: S.err }, err) : null,
				result ? React.createElement("div", { style: { marginTop: 8, flex: 1, minHeight: 0, overflowY: "auto" } },
					React.createElement("p", { style: S.text }, result),
				) : null,
			);
		}

		// ── region root ──────────────────────────────────────────────────
		function ResearchRegion(props) {
			var wide = props.wide, expandSidebar = props.expandSidebar;
			// auth resolution before rendering (anonymous dev bootstrap)
			var [authReady, setAuthReady] = useState(false);
			useEffect(function () {
				var cancelled = false;
				api("/research-auth/me").then(function (j) {
					if (cancelled) return;
					if (ok(j)) { setAuthReady(true); return; }
					api("/research-auth/anon", { method: "GET" }).then(function () {
						if (cancelled) return;
						api("/research-auth/me").then(function (j2) { if (!cancelled) setAuthReady(true); });
					});
				});
				return function () { cancelled = true; };
			}, []);
			// selection (multi) + focus (detail) state
			var [sel, setSel] = useState({});
			var [focused, setFocused] = useState(null);
			var [mode, setMode] = useState(null); // null | 'review' | 'writing'
			var [items, setItems] = useState([]);
			var focus = useCallback(function (id) {
				setFocused(id);
				setSel(function (s) { return Object.assign({}, s, { [id]: true }); });
			}, []);
			var toggleSel = useCallback(function (id) {
				setSel(function (s) {
					var n = Object.assign({}, s);
					if (n[id]) delete n[id]; else n[id] = true;
					return n;
				});
			}, []);
			var clearSel = useCallback(function () { setSel({}); setFocused(null); }, []);
			var selectedPapers = items.filter(function (p) { return sel[p.id]; });
			if (!wide) {
				return React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 10, color: "var(--dsw-alias-label-secondary, #666)" } },
					React.createElement("button", { style: { border: 0, background: "transparent", fontSize: 18, cursor: "pointer", padding: 6, color: "var(--dsw-alias-label-secondary, #666)" }, title: "研究区", onClick: function () { expandSidebar(); } }, "📚"),
				);
			}
			return React.createElement("div", { style: S.root },
				// section title: 研究区
				React.createElement("div", { style: S.section },
					React.createElement("span", { style: S.sectionLabel }, "研究区"),
				),
				!authReady ? React.createElement("p", { style: S.muted, paddingLeft: INSET }, "研究区加载中…")
					: mode === "review" ? React.createElement(ReviewComposer, { papers: selectedPapers, onBack: function () { setMode(null); } })
					: mode === "writing" ? React.createElement(WritingComposer, { onBack: function () { setMode(null); } })
					: React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
						React.createElement(LibraryView, { sel: sel, toggleSel: toggleSel, focus: focus, focused: focused }),
						// bottom action bar: appears after single/multi selection
						Object.keys(sel).length > 0 ? React.createElement("div", { style: S.bar },
							React.createElement("span", { style: S.barLabel }, "已选 " + Object.keys(sel).length + " 篇"),
							React.createElement("button", { style: S.btn, onClick: function () { setMode("review"); } }, "综述"),
							React.createElement("button", { style: S.btn, onClick: function () { setMode("writing"); } }, "写作"),
							React.createElement("button", { style: S.iconBtn, title: "清空选择", onClick: clearSel }, "✕"),
						) : null,
					),
			);
		}

		exports.inject = ["slots"];
		exports.apply = function (ctx) {
			ctx.slots.inject("sidebar.research", function () {
				return ctx.slots.register(
					{ name: "sidebar.research", id: "research-workspace" },
					ResearchRegion,
				);
			});
		};

		return module.exports;
	}
});
