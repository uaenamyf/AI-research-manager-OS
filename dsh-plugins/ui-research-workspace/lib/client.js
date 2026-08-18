// ResearchOS fusion — Research Workspace region (browser half, hand-built in
// the dsh client bundle format consumed by window.__ModuleLoader__).
//
// Registers into the patched `sidebar.research` hole and renders the
// independent ResearchOS UI stacked BELOW the workspace browser inside the
// sidebar column (工作区 upper / 研究区 lower).
//
// No login / subscription UI: on mount the region silently bootstraps an
// anonymous dev session (GET /research-auth/anon — env-gated, dev-only, signs
// a real JWT cookie for a local account); the permission model is untouched
// (every /research-* call still carries a real JWT + user_id filtering). If
// the anon endpoint is disabled (production), pages fall back to a single
// muted "未登录" notice. Visual language follows the workspace browser.
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
			nav: { flex: "none", display: "flex", alignItems: "center", gap: 2, height: 36, margin: "0 " + INSET + " 4px", paddingLeft: 4, boxSizing: "border-box", overflow: "hidden" },
			navBtn: { border: 0, background: "transparent", padding: "4px 10px", borderRadius: 8, fontSize: 13, lineHeight: 20, color: "var(--dsw-alias-label-secondary, #666)", cursor: "pointer" },
			navBtnOn: { border: 0, background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", padding: "4px 10px", borderRadius: 8, fontSize: 13, lineHeight: 20, fontWeight: 500, color: "var(--dsw-alias-label-primary, #111)", cursor: "pointer" },
			body: { flex: 1, minHeight: 0, overflowY: "auto", padding: "0 " + INSET + " 8px", boxSizing: "border-box" },
			header: { flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, height: 32, marginBottom: 4, boxSizing: "border-box" },
			headerTitle: { flex: "none", maxWidth: "55%", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 13, lineHeight: 20, color: "var(--dsw-alias-label-secondary, #666)" },
			iconBtn: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: "none", borderRadius: "50%", padding: 0, background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary, #666)" },
			row: { display: "flex", alignItems: "center", gap: 6, padding: "0 4px", height: 32, borderRadius: 8, cursor: "pointer", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: 18 },
			rowOn: { display: "flex", alignItems: "center", gap: 6, padding: "0 4px", height: 32, borderRadius: 8, cursor: "pointer", background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: 18 },
			rowText: { flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" },
			rowSub: { flex: "none", fontSize: 11, color: "var(--dsw-alias-label-tertiary, #999)" },
			label: { fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 4, display: "block" },
			input: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, lineHeight: 18, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			textarea: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, lineHeight: 18, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", minHeight: 110, resize: "vertical", outline: "none" },
			btn: { padding: "5px 12px", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			btnPrimary: { padding: "5px 12px", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-accent-fill, #2563eb)", color: "#fff", cursor: "pointer" },
			muted: { fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-tertiary, #999)", margin: "8px 4px" },
			err: { fontSize: 12, lineHeight: 18, color: "#dc2626", margin: "6px 4px" },
			ok: { fontSize: 12, color: "#16a34a", margin: "6px 4px" },
			tag: { display: "inline-block", fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-secondary, #666)", margin: "0 4px 4px 0" },
			select: { padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "var(--dsw-alias-input-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			field: { marginBottom: 10 },
			text: { fontSize: 13, lineHeight: 1.55, color: "var(--dsw-alias-label-primary, #111)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" },
			check: { display: "flex", gap: 8, alignItems: "center", padding: "5px 6px", fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-primary, #111)", cursor: "pointer" },
		};

		// ── 文献库 ───────────────────────────────────────────────────────
		function LibraryPage(props) {
			var [q, setQ] = useState("");
			var [items, setItems] = useState(null);
			var [selected, setSelected] = useState(null);
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
				if (selected == null) return;
				setDetail(null); setCard(null);
				api("/research-paper/papers/" + selected).then(function (j) { if (ok(j)) setDetail(j.data); });
				api("/research-paper/papers/" + selected + "/card").then(function (j) { if (ok(j) && j.data) setCard(j.data); });
			}, [selected]);
			return React.createElement("div", { style: S.body },
				unauth ? React.createElement("p", { style: S.muted }, "未登录 — 研究功能需要 ResearchOS 账号") : null,
				React.createElement("div", { style: S.header },
					React.createElement("span", { style: S.headerTitle }, "文献库"),
					React.createElement("div", { style: { display: "flex", gap: 2 } },
						React.createElement("button", { style: S.iconBtn, title: "搜索", onClick: function () { load(q); } }, "⌕"),
						React.createElement("button", { style: S.iconBtn, title: "刷新", onClick: function () { load(""); } }, "↻"),
					),
				),
				React.createElement("input", { style: S.input, placeholder: "检索标题 / 作者 / DOI", value: q, onChange: function (e) { setQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") load(q); } }),
				React.createElement("div", { style: { height: 6 } }),
				err ? React.createElement("p", { style: S.err }, err) : null,
				items == null ? React.createElement("p", { style: S.muted }, "加载中…")
					: items.length === 0 ? React.createElement("p", { style: S.muted }, "暂无文献")
					: items.map(function (it) {
						var on = selected === it.id;
						return React.createElement("div", { key: it.id, style: on ? S.rowOn : S.row, onClick: function () { setSelected(on ? null : it.id); } },
							React.createElement("span", { style: S.rowText }, it.title || "(untitled)"),
							React.createElement("span", { style: S.rowSub }, (it.year || "") + (it.status === "READY" ? "" : " · " + (it.status || ""))),
						);
					}),
				selected != null ? React.createElement("div", { style: { marginTop: 10, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", paddingTop: 8 } },
					detail ? React.createElement(PaperDetail, { detail: detail, card: card }) : React.createElement("p", { style: S.muted }, "加载详情…"),
				) : null,
			);
		}

		function PaperDetail(props) {
			var detail = props.detail, card = props.card;
			var fields = [["Abstract", card ? card.abstract : ""], ["Method", card ? card.method : ""], ["Finding", card ? card.finding : ""], ["Limitation", card ? card.limitation : ""], ["Future work", card ? card.future_work : ""]];
			return React.createElement("div", null,
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "标题"),
					React.createElement("p", { style: S.text }, detail.title || "(untitled)"),
				),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "作者 · 年份 · DOI"),
					React.createElement("p", { style: S.text }, (detail.authors || "—") + (detail.year ? " · " + detail.year : "") + (detail.doi ? " · " + detail.doi : "")),
				),
				card && Array.isArray(card.tags) && card.tags.length ? React.createElement("div", { style: { marginBottom: 10 } },
					card.tags.map(function (t, i) { return React.createElement("span", { key: i, style: S.tag }, (t.name || "") + (t.category ? " · " + t.category : "")); }),
				) : null,
				fields.map(function (f, i) {
					if (!f[1]) return null;
					return React.createElement("div", { key: i, style: S.field },
						React.createElement("span", { style: S.label }, f[0]),
						React.createElement("p", { style: S.text }, String(f[1])),
					);
				}),
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
			var [unauth, setUnauth] = useState(false);
			var loadPapers = useCallback(function () {
				api("/research-paper/search?q=&limit=50").then(function (j) {
					if (j && j.code === 401) { setUnauth(true); return; }
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
						if (st === "SUCCESS") { clearInterval(timer); setMarkdown((j.data.result && j.data.result.markdown) || "(empty)"); }
						else if (st === "FAILED") { clearInterval(timer); setErr(j.data.error || "综述生成失败"); setTaskId(null); }
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
						if (j && j.code === 401) { setUnauth(true); return; }
						if (!ok(j)) { setErr(j.message || "提交失败"); return; }
						setTaskId(j.data.taskId);
					});
			};
			return React.createElement("div", { style: S.body },
				unauth ? React.createElement("p", { style: S.muted }, "未登录 — 研究功能需要 ResearchOS 账号") : null,
				React.createElement("div", { style: S.header },
					React.createElement("span", { style: S.headerTitle }, "综述生成"),
				),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "主题"),
					React.createElement("input", { style: S.input, placeholder: "如：Acoustic classification of gibbon vocalizations", value: topic, onChange: function (e) { setTopic(e.target.value); } }),
				),
				React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.label }, "论文（" + papers.filter(function (p) { return checked[p.id]; }).length + " 篇）"),
					React.createElement("div", { style: { maxHeight: 180, overflowY: "auto", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", borderRadius: 8, padding: 4 } },
						papers.length === 0 ? React.createElement("p", { style: S.muted }, "暂无文献")
							: papers.map(function (p) {
								return React.createElement("label", { key: p.id, style: S.check },
									React.createElement("input", { type: "checkbox", checked: !!checked[p.id], onChange: function (e) { var c = Object.assign({}, checked); c[p.id] = e.target.checked; setChecked(c); } }),
									React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (p.title || "(untitled)")),
								);
							}),
					),
				),
				err ? React.createElement("p", { style: S.err }, err) : null,
				React.createElement("button", { style: S.btnPrimary, onClick: generate, disabled: taskId != null }, taskId != null ? "生成中…" : "生成综述"),
				taskId != null ? React.createElement("p", { style: S.muted }, "任务 #" + taskId + " 处理中，约 30–60 秒…") : null,
				markdown ? React.createElement("div", { style: { marginTop: 10, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", paddingTop: 8 } },
					React.createElement("pre", { style: Object.assign({}, S.text, { fontFamily: "inherit", maxHeight: 360, overflowY: "auto" }) }, markdown),
				) : null,
			);
		}

		// ── 写作 ─────────────────────────────────────────────────────────
		var ACTIONS = [["polish", "润色"], ["expand", "扩写"], ["shorten", "缩写"], ["translate", "翻译"], ["rebuttal", "审稿回复"], ["cover_letter", "Cover Letter"]];
		function WritingPage(props) {
			var [text, setText] = useState("");
			var [action, setAction] = useState("polish");
			var [instruction, setInstruction] = useState("");
			var [result, setResult] = useState(null);
			var [err, setErr] = useState(null);
			var [unauth, setUnauth] = useState(false);
			var [busy, setBusy] = useState(false);
			var rewrite = function () {
				if (!text.trim()) { setErr("请输入文本"); return; }
				setBusy(true); setErr(null); setResult(null);
				var body = { text: text, action: action };
				if (instruction.trim()) body.instruction = instruction.trim();
				api("/research-writing/rewrite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
					.then(function (j) {
						if (j && j.code === 401) { setUnauth(true); return; }
						if (!ok(j)) { setErr(j.message || "改写失败"); return; }
						setResult(j.data && j.data.text);
					})
					.finally(function () { setBusy(false); });
			};
			return React.createElement("div", { style: S.body },
				unauth ? React.createElement("p", { style: S.muted }, "未登录 — 研究功能需要 ResearchOS 账号") : null,
				React.createElement("div", { style: S.header },
					React.createElement("span", { style: S.headerTitle }, "写作助手"),
				),
				React.createElement("textarea", { style: S.textarea, placeholder: "粘贴要处理的文本…", value: text, onChange: function (e) { setText(e.target.value); } }),
				React.createElement("div", { style: { height: 8 } }),
				React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
					React.createElement("select", { style: S.select, value: action, onChange: function (e) { setAction(e.target.value); } },
						ACTIONS.map(function (a) { return React.createElement("option", { key: a[0], value: a[0] }, a[1]); }),
					),
					React.createElement("button", { style: S.btnPrimary, onClick: rewrite, disabled: busy }, busy ? "处理中…" : "改写"),
				),
				React.createElement("div", { style: { height: 8 } }),
				React.createElement("input", { style: S.input, placeholder: "附加指令（可选）", value: instruction, onChange: function (e) { setInstruction(e.target.value); } }),
				err ? React.createElement("p", { style: S.err }, err) : null,
				result ? React.createElement("div", { style: { marginTop: 10, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", paddingTop: 8 } },
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
			var set = function (which, key, numeric) { return function (e) {
				var v = numeric ? (Number(e.target.value) || 0) : e.target.value;
				var cur = which === "llm" ? llm : which === "translation" ? translation : knowledge;
				var setter = which === "llm" ? setLlm : which === "translation" ? setTranslation : setKnowledge;
				setter(Object.assign({}, cur, { [key]: v }));
			}; };
			return React.createElement("div", { style: S.body },
				React.createElement("div", { style: S.header },
					React.createElement("span", { style: S.headerTitle }, "研究设置"),
				),
				settings == null ? React.createElement("p", { style: S.muted }, "加载中…")
					: React.createElement("div", null,
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "LLM 默认模型"),
							React.createElement("input", { style: S.input, value: llm.defaultModel || "", onChange: set("llm", "defaultModel"), placeholder: "如 ark-code-latest" }),
						),
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "LLM 温度"),
							React.createElement("input", { style: S.input, type: "number", step: 0.1, value: llm.temperature ?? "", onChange: set("llm", "temperature", true) }),
						),
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "翻译目标语言"),
							React.createElement("input", { style: S.input, value: translation.targetLang || "", onChange: set("translation", "targetLang"), placeholder: "如 zh-CN" }),
						),
						React.createElement("div", { style: S.field },
							React.createElement("span", { style: S.label }, "Knowledge 检索 top_k"),
							React.createElement("input", { style: S.input, type: "number", value: knowledge.retrieveTopK ?? "", onChange: set("knowledge", "topK", true) }),
						),
						React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
							React.createElement("button", { style: S.btnPrimary, onClick: save }, "保存"),
							saved ? React.createElement("span", { style: S.ok }, "已保存 ✓") : null,
						),
					),
			);
		}

		// ── region root ──────────────────────────────────────────────────
		function ResearchRegion(props) {
			var wide = props.wide, expandSidebar = props.expandSidebar;
			var [page, setPage] = useState("library");
			// No login UI: resolve auth BEFORE rendering pages so the anonymous
			// dev session cookie is in place when the pages first call the APIs
			// (avoids a 401 race on mount). Sequence: /me -> (401) /anon -> /me.
			var [authReady, setAuthReady] = useState(false);
			useEffect(function () {
				var cancelled = false;
				var resolveAuth = function () {
					api("/research-auth/me").then(function (j) {
						if (cancelled) return;
						if (ok(j)) { setAuthReady(true); return; }
						api("/research-auth/anon", { method: "GET" }).then(function (a) {
							if (cancelled) return;
							api("/research-auth/me").then(function (j2) {
								if (cancelled) return;
								setAuthReady(true); // even if still 401 — pages self-report
							});
						});
					});
				};
				resolveAuth();
				return function () { cancelled = true; };
			}, []);
			if (!wide) {
				return React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 10, color: "var(--dsw-alias-label-secondary, #666)" } },
					React.createElement("button", { style: { border: 0, background: "transparent", fontSize: 18, cursor: "pointer", padding: 6, color: "var(--dsw-alias-label-secondary, #666)" }, title: "研究区", onClick: function () { expandSidebar(); } }, "📚"),
				);
			}
			if (!authReady) {
				return React.createElement("div", { style: S.root },
					React.createElement("p", { style: S.muted }, "研究区加载中…"),
				);
			}
			var nav = [["library", "文献库"], ["review", "综述"], ["writing", "写作"], ["settings", "设置"]];
			return React.createElement("div", { style: S.root },
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
