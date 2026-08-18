// ResearchOS fusion — Research Workspace region (browser half, hand-built in
// the dsh client bundle format consumed by window.__ModuleLoader__).
//
// Registers into the patched `sidebar.research` hole (ui-sidebar section
// switch: 工作区 / 研究区) and renders the independent ResearchOS UI —
// literature library / paper detail / review generation / writing / settings —
// by calling the /research-* bundles directly (shared JWT cookie). The
// agent-driven chat nodes (ui-research-*) are untouched; this region is the
// standalone "研究区" parallel to the Workspace browser.
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
		var useMemo = React.useMemo;

		// ── tiny helpers ──────────────────────────────────────────────────
		function api(path, opts) {
			opts = opts || {};
			return fetch(path, Object.assign({ credentials: "include" }, opts))
				.then(function (r) { return r.json().catch(function () { return {}; }); });
		}
		function ok(j) { return j && j.code === 0; }

		// ── shared styles (DSW tokens with fallbacks) ─────────────────────
		var S = {
			nav: { display: "flex", gap: 2, padding: "0 8px 8px", borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", marginBottom: 8, flexWrap: "wrap" },
			navBtn: { border: 0, background: "transparent", padding: "6px 10px", borderRadius: 8, fontSize: 13, color: "var(--dsw-alias-label-secondary, #666)", cursor: "pointer" },
			navBtnOn: { border: 0, background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", padding: "6px 10px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-primary, #111)", cursor: "pointer" },
			body: { padding: "0 12px 16px", overflowY: "auto", minHeight: 0, flex: 1 },
			input: { width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)" },
			btn: { padding: "7px 14px", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			btnPrimary: { padding: "7px 14px", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, background: "#2563eb", color: "#fff", cursor: "pointer" },
			row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
			title: { fontSize: 15, fontWeight: 600, color: "var(--dsw-alias-label-primary, #111)", margin: "0 0 4px" },
			sub: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", margin: 0 },
			card: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", background: "var(--dsw-alias-surface, #fff)", marginBottom: 6, cursor: "pointer" },
			cardOn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #2563eb", background: "rgba(37,99,235,.06)", marginBottom: 6, cursor: "pointer" },
			field: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 },
			label: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" },
			text: { fontSize: 13, lineHeight: 1.5, color: "var(--dsw-alias-label-primary, #111)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" },
			err: { fontSize: 12, color: "#dc2626", margin: "6px 0 0" },
			ok: { fontSize: 12, color: "#16a34a", margin: "6px 0 0" },
			select: { padding: "7px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)" },
			tag: { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(37,99,235,.1)", color: "#2563eb", margin: "0 4px 4px 0" },
			rail: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 12, color: "var(--dsw-alias-label-secondary, #666)" },
			railBtn: { border: 0, background: "transparent", fontSize: 20, cursor: "pointer", padding: 6, color: "var(--dsw-alias-label-secondary, #666)" },
		};

		// ── auth gate ────────────────────────────────────────────────────
		function AuthGate(props) {
			var me = props.me, onChanged = props.onChanged;
			var [email, setEmail] = useState("");
			var [pass, setPass] = useState("");
			var [busy, setBusy] = useState(false);
			var [err, setErr] = useState(null);
			var submit = function (mode) {
				if (!email || !pass) { setErr("请输入邮箱和密码"); return; }
				setBusy(true); setErr(null);
				api("/research-auth/" + mode, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email, password: pass }) })
					.then(function (j) {
						if (!ok(j)) { setErr(j.message || (mode === "login" ? "登录失败" : "注册失败")); return; }
						onChanged();
					})
					.finally(function () { setBusy(false); });
			};
			return React.createElement("div", { style: { padding: 16 } },
				React.createElement("p", { style: S.title }, "研究区 · 登录"),
				React.createElement("p", { style: S.sub, marginBottom: 12 }, "使用 ResearchOS 账号登录以访问文献库与 AI 工具"),
				React.createElement("input", { style: S.input, placeholder: "邮箱", value: email, onChange: function (e) { setEmail(e.target.value); } }),
				React.createElement("div", { style: { height: 8 } }),
				React.createElement("input", { style: S.input, type: "password", placeholder: "密码", value: pass, onChange: function (e) { setPass(e.target.value); } }),
				err ? React.createElement("p", { style: S.err }, err) : null,
				React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
					React.createElement("button", { style: S.btnPrimary, onClick: function () { submit("login"); }, disabled: busy }, busy ? "…" : "登录"),
					React.createElement("button", { style: S.btn, onClick: function () { submit("register"); }, disabled: busy }, "注册"),
				),
			);
		}

		// ── 文献库 ───────────────────────────────────────────────────────
		function LibraryPage(props) {
			var [q, setQ] = useState("");
			var [items, setItems] = useState(null);
			var [selected, setSelected] = useState(null);
			var [detail, setDetail] = useState(null);
			var [card, setCard] = useState(null);
			var [err, setErr] = useState(null);
			var load = useCallback(function (query) {
				setErr(null);
				api("/research-paper/search?q=" + encodeURIComponent(query || "") + "&limit=50")
					.then(function (j) {
						if (!ok(j)) { setErr(j.message || "文献加载失败"); setItems([]); return; }
						setItems(j.data.items || []);
					})
					.catch(function () { setErr("网络错误"); setItems([]); });
			}, []);
			useEffect(function () { load(""); }, [load]);
			useEffect(function () {
				if (selected == null) return;
				setDetail(null); setCard(null);
				api("/research-paper/papers/" + selected).then(function (j) {
					if (ok(j)) setDetail(j.data);
				});
				api("/research-paper/papers/" + selected + "/card").then(function (j) {
					if (ok(j) && j.data) setCard(j.data);
				});
			}, [selected]);
			return React.createElement("div", { style: S.body },
				React.createElement("div", { style: S.row },
					React.createElement("p", { style: S.title }, "文献库"),
					React.createElement("button", { style: S.btn, onClick: function () { load(q); } }, "刷新"),
				),
				React.createElement("div", { style: S.row, marginBottom: 10 },
					React.createElement("input", { style: Object.assign({}, S.input, { flex: 1 }), placeholder: "检索标题/作者/DOI，回车搜索", value: q, onChange: function (e) { setQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") load(q); } }),
					React.createElement("button", { style: S.btnPrimary, onClick: function () { load(q); } }, "搜索"),
				),
				err ? React.createElement("p", { style: S.err }, err) : null,
				items == null ? React.createElement("p", { style: S.sub }, "加载中…")
					: items.length === 0 ? React.createElement("p", { style: S.sub }, "暂无文献")
					: items.map(function (it) {
						var on = selected === it.id;
						return React.createElement("div", { key: it.id, style: on ? S.cardOn : S.card, onClick: function () { setSelected(on ? null : it.id); } },
							React.createElement("p", { style: S.title, margin: 0 }, it.title || "(untitled)"),
							React.createElement("p", { style: S.sub }, (it.authors || "—") + " · " + (it.year || "n.d.") + " · " + (it.status || "")),
						);
					}),
				selected != null ? React.createElement("div", { style: { marginTop: 12, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", paddingTop: 10 } },
					detail ? React.createElement(PaperDetail, { detail: detail, card: card }) : React.createElement("p", { style: S.sub }, "加载论文详情…"),
				) : null,
			);
		}

		function PaperDetail(props) {
			var detail = props.detail, card = props.card;
			var blocks = [];
			if (card) {
				var fields = [["摘要", card.abstract], ["方法", card.method], ["发现", card.finding], ["局限", card.limitation], ["未来工作", card.future_work]];
				fields.forEach(function (f) {
					if (f[1]) blocks.push(React.createElement("div", { key: f[0], style: S.field },
						React.createElement("span", { style: S.label }, f[0]),
						React.createElement("p", { style: S.text }, String(f[1])),
					));
				});
			}
			return React.createElement("div", null,
				React.createElement("p", { style: S.title }, detail.title || "(untitled)"),
				React.createElement("p", { style: S.sub }, (detail.authors || "—") + (detail.year ? " · " + detail.year : "")),
				detail.doi ? React.createElement("p", { style: S.sub }, "DOI: " + detail.doi) : null,
				React.createElement("div", { style: { marginTop: 6 } },
					(card && Array.isArray(card.tags) ? card.tags : []).map(function (t, i) {
						return React.createElement("span", { key: i, style: S.tag }, (t.name || "") + (t.category ? " · " + t.category : ""));
					}),
				),
				blocks,
				card ? null : React.createElement("p", { style: S.sub }, "（暂无 Paper Card 摘要）"),
			);
		}

		// ── 综述生成 ─────────────────────────────────────────────────────
		function ReviewPage(props) {
			var [topic, setTopic] = useState("");
			var [papers, setPapers] = useState([]);
			var [checked, setChecked] = useState({});
			var [taskId, setTaskId] = useState(null);
			var [markdown, setMarkdown] = useState(null);
			var [err, setErr] = useState(null);
			var loadPapers = useCallback(function () {
				api("/research-paper/search?q=&limit=50").then(function (j) {
					if (!ok(j)) return;
					setPapers(j.data.items || []);
					var c = {}; (j.data.items || []).forEach(function (p) { c[p.id] = true; });
					setChecked(c);
				});
			}, []);
			useEffect(function () { loadPapers(); }, [loadPapers]);
			useEffect(function () {
				if (taskId == null) return;
				var timer = setInterval(function () {
					api("/research-review/" + taskId).then(function (j) {
						if (!ok(j)) return;
						var st = j.data && j.data.status;
						if (st === "SUCCESS") {
							clearInterval(timer);
							setMarkdown((j.data.result && j.data.result.markdown) || "(empty)");
						} else if (st === "FAILED") {
							clearInterval(timer);
							setErr(j.data.error || "综述生成失败");
							setTaskId(null);
						}
					});
				}, 3000);
				return function () { clearInterval(timer); };
			}, [taskId]);
			var generate = function () {
				if (!topic.trim()) { setErr("请输入综述主题"); return; }
				var ids = Object.keys(checked).filter(function (k) { return checked[k]; }).map(Number);
				if (!ids.length) { setErr("请至少选择一篇论文"); return; }
				setErr(null); setMarkdown(null);
				api("/research-review/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paperIds: ids, topic: topic.trim() }) })
					.then(function (j) {
						if (!ok(j)) { setErr(j.message || "提交失败"); return; }
						setTaskId(j.data.taskId);
					});
			};
			return React.createElement("div", { style: S.body },
				React.createElement("p", { style: S.title }, "综述生成"),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "综述主题"),
					React.createElement("input", { style: S.input, placeholder: "如：Acoustic classification of gibbon vocalizations", value: topic, onChange: function (e) { setTopic(e.target.value); } }),
				),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "选择论文（" + papers.filter(function (p) { return checked[p.id]; }).length + " 篇）"),
					React.createElement("div", { style: { maxHeight: 220, overflowY: "auto", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", borderRadius: 8, padding: 4 } },
						papers.length === 0 ? React.createElement("p", { style: S.sub }, "暂无文献")
							: papers.map(function (p) {
								return React.createElement("label", { key: p.id, style: { display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", fontSize: 12, cursor: "pointer" } },
									React.createElement("input", { type: "checkbox", checked: !!checked[p.id], onChange: function (e) { var c = Object.assign({}, checked); c[p.id] = e.target.checked; setChecked(c); } }),
									React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (p.title || "(untitled)")),
								);
							}),
					),
				),
				err ? React.createElement("p", { style: S.err }, err) : null,
				React.createElement("button", { style: S.btnPrimary, onClick: generate, disabled: taskId != null }, taskId != null ? "生成中…" : "生成综述"),
				taskId != null ? React.createElement("p", { style: S.sub, marginTop: 8 }, "任务 #" + taskId + " 处理中，约 30–60 秒…") : null,
				markdown ? React.createElement("div", { style: { marginTop: 12, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", paddingTop: 10 } },
					React.createElement("pre", { style: Object.assign({}, S.text, { fontFamily: "inherit", maxHeight: 400, overflowY: "auto" }) }, markdown),
				) : null,
			);
		}

		// ── 写作 ─────────────────────────────────────────────────────────
		var ACTIONS = [["polish", "润色"], ["expand", "扩写"], ["shorten", "缩写"], ["translate", "翻译"], ["rebuttal", "审稿意见回复"], ["cover_letter", "Cover Letter"]];
		function WritingPage(props) {
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
				React.createElement("p", { style: S.title }, "写作助手"),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "文本"),
					React.createElement("textarea", { style: Object.assign({}, S.input, { minHeight: 120, resize: "vertical" }), placeholder: "粘贴要处理的文本…", value: text, onChange: function (e) { setText(e.target.value); } }),
				),
				React.createElement("div", { style: S.row, marginBottom: 10 },
					React.createElement("select", { style: S.select, value: action, onChange: function (e) { setAction(e.target.value); } },
						ACTIONS.map(function (a) { return React.createElement("option", { key: a[0], value: a[0] }, a[1]); }),
					),
					React.createElement("button", { style: S.btnPrimary, onClick: rewrite, disabled: busy }, busy ? "处理中…" : "改写"),
				),
				React.createElement("input", { style: S.input, placeholder: "附加指令（可选）", value: instruction, onChange: function (e) { setInstruction(e.target.value); } }),
				err ? React.createElement("p", { style: S.err }, err) : null,
				result ? React.createElement("div", { style: { marginTop: 12, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", paddingTop: 10 } },
					React.createElement("p", { style: S.text }, result),
				) : null,
			);
		}

		// ── 设置 ─────────────────────────────────────────────────────────
		function SettingsPage(props) {
			var [settings, setSettings] = useState(null);
			var [llm, setLlm] = useState({});
			var [translation, setTranslation] = useState({});
			var [knowledge, setKnowledge] = useState({});
			var [saved, setSaved] = useState(false);
			useEffect(function () {
				api("/research-settings").then(function (j) {
					if (!ok(j)) return;
					var d = j.data || {};
					setSettings(d);
					setLlm(d.llm || {});
					setTranslation(d.translation || {});
					setKnowledge(d.knowledge || {});
				});
			}, []);
			var save = function () {
				setSaved(false);
				api("/research-settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ llm: llm, translation: translation, knowledge: knowledge }) })
					.then(function (j) { setSaved(ok(j)); });
			};
			var set = function (which, key) { return function (e) {
				var v = e.target.value;
				if (which === "llm") setLlm(Object.assign({}, llm, (key === "temperature" || key === "topK" ? { [key]: Number(v) || 0 } : { [key]: v })));
				else if (which === "translation") setTranslation(Object.assign({}, translation, { [key]: v }));
				else setKnowledge(Object.assign({}, knowledge, (key === "topK" ? { [key]: Number(v) || 0 } : { [key]: v })));
			}; };
			return React.createElement("div", { style: S.body },
				React.createElement("p", { style: S.title }, "研究设置"),
				settings == null ? React.createElement("p", { style: S.sub }, "加载中…")
					: React.createElement("div", null,
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "LLM · 默认模型"),
							React.createElement("input", { style: S.input, value: llm.defaultModel || "", onChange: set("llm", "defaultModel"), placeholder: "如 ark-code-latest" }),
						),
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "LLM · 温度"),
							React.createElement("input", { style: S.input, type: "number", step: 0.1, value: llm.temperature ?? "", onChange: set("llm", "temperature") }),
						),
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "翻译 · 目标语言"),
							React.createElement("input", { style: S.input, value: translation.targetLang || "", onChange: set("translation", "targetLang"), placeholder: "如 zh-CN" }),
						),
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "Knowledge · 检索 top_k"),
							React.createElement("input", { style: S.input, type: "number", value: knowledge.retrieveTopK ?? "", onChange: set("knowledge", "topK") }),
						),
						React.createElement("div", { style: S.row },
							React.createElement("button", { style: S.btnPrimary, onClick: save }, "保存"),
							saved ? React.createElement("span", { style: S.ok }, "已保存 ✓") : null,
						),
					),
			);
		}

		// ── region root ──────────────────────────────────────────────────
		function ResearchRegion(props) {
			var wide = props.wide, expandSidebar = props.expandSidebar;
			var [me, setMe] = useState("loading");
			var [page, setPage] = useState("library");
			var reload = useCallback(function () {
				api("/research-auth/me").then(function (j) { setMe(ok(j) ? j.data : null); });
			}, []);
			useEffect(reload, [reload]);
			if (!wide) {
				return React.createElement("div", { style: S.rail },
					React.createElement("button", { style: S.railBtn, title: "研究区", onClick: function () { expandSidebar(); } }, "📚"),
				);
			}
			var body;
			if (me === "loading") body = React.createElement("p", { style: S.sub, padding: 16 }, "加载中…");
			else if (!me) body = React.createElement(AuthGate, { me: me, onChanged: reload });
			else {
				var nav = [["library", "文献库"], ["review", "综述"], ["writing", "写作"], ["settings", "设置"]];
				body = React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
					React.createElement("div", { style: S.nav },
						nav.map(function (n) {
							return React.createElement("button", { key: n[0], style: page === n[0] ? S.navBtnOn : S.navBtn, onClick: function () { setPage(n[0]); } }, n[1]);
						}),
					),
					page === "library" ? React.createElement(LibraryPage, null)
						: page === "review" ? React.createElement(ReviewPage, null)
						: page === "writing" ? React.createElement(WritingPage, null)
						: React.createElement(SettingsPage, null),
				);
			}
			return React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" } }, body);
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
