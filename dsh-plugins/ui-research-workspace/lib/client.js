// ResearchOS fusion — Research Workspace region (browser half, hand-built in
// the dsh client bundle format consumed by window.__ModuleLoader__).
//
// Registers into the patched `sidebar.research` hole and renders the research
// workspace stacked BELOW the workspace browser (工作区 upper / 研究区 lower).
//
// Design (per user): the region has a "研究区" section title (typography /
// geometry mirrored from the workspace browser) and hosts ONLY the literature
// library. Clicking a paper shows its preview + Paper Intelligence Card +
// author info in the content area. Selecting one or more papers (checkbox
// multi-select) reveals a bottom action bar with 综述 / 写作.
// No login / subscription UI: on mount the region silently bootstraps an
// anonymous dev session (GET /research-auth/anon, env-gated); the permission
// model is untouched (real JWT + user_id filtering).
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
		var SCROLL_W = 8, SCROLL_OFF = 2;

		// Inline icons — SVG paths verbatim from
		// @deepseek-ai/dsh-client-ui-primitives (IconSearchOutline16 / IconCloseOutline16)
		// so the search affordance matches the workspace browser exactly.
		function IconSearch(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z", fill: "currentColor" }),
				React.createElement("path", { d: "M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z", fill: "currentColor" }),
			);
		}
		function IconClose(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z", fill: "currentColor" }),
				React.createElement("path", { d: "M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z", fill: "currentColor" }),
			);
		}

		// ── shared styles: geometry mirrored 1:1 from ui-workspace ───────
		var S = {
			// region column
			root: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", boxSizing: "border-box", paddingRight: INSET },
			// workspace list (the only scrolling region)
			list: { flex: 1, minHeight: 0, overflowY: "auto", marginLeft: -4, marginRight: SCROLL_OFF, paddingLeft: 4, paddingRight: "calc(" + INSET + " - " + SCROLL_W + "px - " + SCROLL_OFF + "px)", paddingBottom: 16, scrollbarGutter: "stable" },
			// section header (workspace .sectionHeader)
			header: { flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, height: 36, paddingLeft: 4, marginTop: 2, marginRight: -4, marginBottom: 4, boxSizing: "border-box", borderRadius: 12, overflow: "hidden", color: "var(--dsw-alias-label-tertiary, #999)" },
			// section label (workspace .sectionLabel)
			label: { flex: "none", maxWidth: "45%", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", fontSize: 13, lineHeight: 20, color: "var(--dsw-alias-label-secondary, #666)", marginRight: "auto" },
			// icon button (workspace .iconButton 28x28)
			iconBtn: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "none", borderRadius: "50%", padding: 0, background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary, #666)" },
			// search capsule (workspace .searchExpanded: 30px, radius 10, border l2)
			search: { flex: 1, minWidth: 0, height: 30, marginInline: -2, padding: "0 4px 0 8px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 2, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 10, background: "transparent", color: "var(--dsw-alias-label-caption, #888)" },
			searchInput: { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, lineHeight: 18, color: "var(--dsw-alias-label-primary, #111)" },
			// session row (workspace .sessionRow 32px; title 13px/20px)
			row: { display: "flex", alignItems: "center", height: 32, boxSizing: "border-box", borderRadius: 8, cursor: "pointer", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: 20 },
			rowOn: { display: "flex", alignItems: "center", height: 32, boxSizing: "border-box", borderRadius: 8, cursor: "pointer", background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: 20 },
			rowTitle: { flex: 1, minWidth: 0, margin: "0 6px 0 4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 13, lineHeight: 20 },
			rowSub: { flex: "none", fontSize: 12, lineHeight: 17, color: "var(--dsw-alias-label-tertiary, #999)" },
			checkbox: { flex: "none", width: 16, height: 16, margin: 0, cursor: "pointer", accentColor: "var(--dsw-accent-fill, #2563eb)" },
			// empty / status text (workspace .empty / .searchStatus)
			empty: { padding: "10px 12px", fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-tertiary, #999)" },
			err: { padding: "6px 12px", fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-state-error-primary, #dc2626)" },
			// detail panel (content area below the list)
			detail: { flex: "none", maxHeight: "45%", overflowY: "auto", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", marginTop: 2, padding: "8px 4px 10px", boxSizing: "border-box" },
			detailTitle: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: "0 0 4px", color: "var(--dsw-alias-label-primary, #111)" },
			detailMeta: { fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-tertiary, #999)", margin: "0 0 6px" },
			tag: { display: "inline-block", fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-secondary, #666)", margin: "0 4px 4px 0" },
			fieldLabel: { fontSize: 12, lineHeight: 18, color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 2, display: "block" },
			text: { fontSize: 13, lineHeight: 1.5, color: "var(--dsw-alias-label-primary, #111)", margin: "0 0 8px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
			// inputs / buttons
			input: { boxSizing: "border-box", width: "100%", height: 36, padding: "7px 14px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 18, outline: "none", background: "transparent", fontSize: 13, lineHeight: 18, color: "var(--dsw-alias-label-primary, #111)" },
			textarea: { boxSizing: "border-box", width: "100%", minHeight: 80, padding: "7px 14px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 14, outline: "none", background: "transparent", fontSize: 13, lineHeight: 18, color: "var(--dsw-alias-label-primary, #111)", resize: "vertical" },
			btn: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			btnPrimary: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-accent-fill, #2563eb)", color: "#fff", cursor: "pointer" },
			select: { padding: "5px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "transparent", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			field: { marginBottom: 10 },
			// bottom action bar
			bar: { flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "6px " + INSET, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", boxSizing: "border-box" },
			barLabel: { flex: 1, minWidth: 0, fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
		};

		// Paper Intelligence Card detail (preview + card + author info).
		function PaperDetail(props) {
			var detail = props.detail, card = props.card;
			var fields = [["Abstract", card ? card.abstract : ""], ["Method", card ? card.method : ""], ["Finding", card ? card.finding : ""], ["Limitation", card ? card.limitation : ""], ["Future work", card ? card.future_work : ""]];
			return React.createElement("div", { style: S.detail },
				React.createElement("p", { style: S.detailTitle }, detail.title || "(untitled)"),
				React.createElement("p", { style: S.detailMeta }, (detail.authors || "—") + (detail.year ? " · " + detail.year : "") + (detail.doi ? " · DOI: " + detail.doi : "")),
				card && Array.isArray(card.tags) && card.tags.length ? React.createElement("div", { style: { marginBottom: 6 } },
					card.tags.map(function (t, i) { return React.createElement("span", { key: i, style: S.tag }, (t.name || "") + (t.category ? " · " + t.category : "")); }),
				) : null,
				fields.map(function (f, i) {
					if (!f[1]) return null;
					return React.createElement("div", { key: i, style: S.field },
						React.createElement("span", { style: S.fieldLabel }, f[0]),
						React.createElement("p", { style: S.text }, String(f[1])),
					);
				}),
				card ? null : React.createElement("p", { style: S.empty }, "（暂无 Paper Intelligence Card，可重新分析生成）"),
			);
		}

		// ── 文献库（唯一功能页）─────────────────────────────────────────
		function LibraryView(props) {
			var sel = props.sel, toggleSel = props.toggleSel, focus = props.focus, focused = props.focused;
			var [q, setQ] = useState("");
			var [searchOpen, setSearchOpen] = useState(false);
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
			return React.createElement("div", { style: S.root },
				unauth ? React.createElement("p", { style: S.empty }, "未登录 — 研究功能需要 ResearchOS 账号") : null,
				// section header: 研究区 title + inline search toggle (workspace style)
				React.createElement("div", { style: S.header },
					searchOpen
						? React.createElement("div", { style: S.search },
							React.createElement("input", { style: S.searchInput, placeholder: "检索标题 / 作者 / DOI", value: q, autoFocus: true, onChange: function (e) { setQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") load(q); } }),
							React.createElement("button", { style: S.iconBtn, title: "关闭检索", onClick: function () { setSearchOpen(false); } }, React.createElement(IconClose, null)),
						)
						: React.createElement(React.Fragment, null,
							React.createElement("span", { style: S.label }, "研究区"),
							React.createElement("button", { style: S.iconBtn, title: "检索", onClick: function () { setSearchOpen(true); } }, React.createElement(IconSearch, null)),
						),
				),
				err ? React.createElement("p", { style: S.err }, err) : null,
				React.createElement("div", { style: S.list },
					items == null ? React.createElement("p", { style: S.empty }, "加载中…")
						: items.length === 0 ? React.createElement("p", { style: S.empty }, "暂无文献")
						: items.map(function (it, idx) {
							var on = focused === it.id;
							var rowStyle = Object.assign({}, on ? S.rowOn : S.row, idx > 0 ? { marginTop: 2 } : {});
							return React.createElement("div", { key: it.id, style: rowStyle, onClick: function () { focus(it.id); } },
								React.createElement("input", { type: "checkbox", style: S.checkbox, checked: !!sel[it.id], onClick: function (e) { e.stopPropagation(); }, onChange: function (e) { toggleSel(it.id); } }),
								React.createElement("span", { style: S.rowTitle }, it.title || "(untitled)"),
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
			return React.createElement("div", { style: S.root, paddingTop: 2 },
				React.createElement("div", { style: S.header },
					React.createElement("span", { style: S.label }, "生成综述 · 已选 " + papers.length + " 篇"),
					React.createElement("button", { style: S.iconBtn, title: "返回", onClick: onBack }, "←"),
				),
				React.createElement("div", { style: { padding: "0 12px" } },
					React.createElement("div", { style: S.field },
						React.createElement("span", { style: S.fieldLabel }, "主题"),
						React.createElement("input", { style: S.input, placeholder: "如：Acoustic classification of gibbon vocalizations", value: topic, onChange: function (e) { setTopic(e.target.value); } }),
					),
					err ? React.createElement("p", { style: S.err, padding: 0 }, err) : null,
					React.createElement("button", { style: S.btnPrimary, onClick: generate, disabled: taskId != null }, taskId != null ? "生成中…" : "生成综述"),
					taskId != null ? React.createElement("p", { style: S.empty }, "任务 #" + taskId + " 处理中…") : null,
				),
				markdown ? React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" } },
					React.createElement("pre", { style: Object.assign({}, S.text, { fontFamily: "inherit" }) }, markdown),
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
			return React.createElement("div", { style: S.root, paddingTop: 2 },
				React.createElement("div", { style: S.header },
					React.createElement("span", { style: S.label }, "写作助手"),
					React.createElement("button", { style: S.iconBtn, title: "返回", onClick: onBack }, "←"),
				),
				React.createElement("div", { style: { padding: "0 12px" } },
					React.createElement("textarea", { style: S.textarea, placeholder: "粘贴要处理的文本…", value: text, onChange: function (e) { setText(e.target.value); } }),
					React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", margin: "8px 0" } },
						React.createElement("select", { style: S.select, value: action, onChange: function (e) { setAction(e.target.value); } },
							ACTIONS.map(function (a) { return React.createElement("option", { key: a[0], value: a[0] }, a[1]); }),
						),
						React.createElement("button", { style: S.btnPrimary, onClick: rewrite, disabled: busy }, busy ? "处理中…" : "改写"),
					),
					React.createElement("input", { style: S.input, placeholder: "附加指令（可选）", value: instruction, onChange: function (e) { setInstruction(e.target.value); } }),
					err ? React.createElement("p", { style: S.err, padding: 0 }, err) : null,
				),
				result ? React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" } },
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
			return React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
				!authReady ? React.createElement("p", { style: S.empty }, "研究区加载中…")
					: mode === "review" ? React.createElement(ReviewComposer, { papers: selectedPapers, onBack: function () { setMode(null); } })
					: mode === "writing" ? React.createElement(WritingComposer, { onBack: function () { setMode(null); } })
					: React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
						React.createElement(LibraryView, { sel: sel, toggleSel: toggleSel, focus: focus, focused: focused }),
						// bottom action bar: appears after single/multi selection
						Object.keys(sel).length > 0 ? React.createElement("div", { style: S.bar },
							React.createElement("span", { style: S.barLabel }, "已选 " + Object.keys(sel).length + " 篇"),
							React.createElement("button", { style: S.btn, onClick: function () { setMode("review"); } }, "综述"),
							React.createElement("button", { style: S.btn, onClick: function () { setMode("writing"); } }, "写作"),
							React.createElement("button", { style: S.iconBtn, title: "清空选择", onClick: clearSel }, React.createElement(IconClose, null)),
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
