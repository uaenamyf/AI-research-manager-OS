// Phase 4 ui-research-project — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// (项目/项目管理/文件夹/目录). The renderer shows a project & folder tree
// management panel:
//   - create project form (POST /research-project)
//   - project list (name/desc/domain + 新建文件夹/删除)
//   - per-project folder tree (GET /research-folder/projects/:pid/folders/tree,
//     recursive render) + create/delete folder
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-project",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var TRIGGER = /(项目管理|项目|文件夹|目录|project)/i;

		// ── Definition: one-shot node on a triggering user message ──
		var projectDefinition = {
			kind: "research-project",
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
				return { at: match.event.seq, triggered: true };
			},
			update: function (context) { return context.state; },
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.triggered) return null;
				return {
					key: context.key,
					kind: "research-project",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.at,
					location: context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" },
					visibility: "visible",
					data: {},
				};
			},
		};

		// ── Renderer: project & folder management panel ──
		function ProjectView(props) {
			var state = React.useState({ loading: true, projects: [], error: null });
			var data = state[0];
			var setData = state[1];
			var formState = React.useState({ name: "", description: "", domain: "" });
			var form = formState[0];
			var setForm = formState[1];
			var folderInputs = React.useState({});
			var folderInput = folderInputs[0];
			var setFolderInput = folderInputs[1];
			var trees = React.useState({});
			var treeData = trees[0];
			var setTreeData = trees[1];
			var msgState = React.useState("");
			var msg = msgState[0];
			var setMsg = msgState[1];

			var reload = function () {
				fetch("/research-project?page=0&size=100", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (j && j.code === 0) setData({ loading: false, projects: j.data.items || [], error: null });
						else setData({ loading: false, projects: [], error: (j && j.code === 401) ? "sign in" : "load err" });
					})
					.catch(function () { setData({ loading: false, projects: [], error: "no api" }); });
			};
			React.useEffect(function () { reload(); }, []);

			var loadTree = function (pid) {
				if (treeData[pid] !== undefined) return;
				fetch("/research-folder/projects/" + pid + "/folders/tree", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						setTreeData(function (prev) { var next = Object.assign({}, prev); next[pid] = (j && j.code === 0) ? j.data : []; return next; });
					})
					.catch(function () { setTreeData(function (prev) { var next = Object.assign({}, prev); next[pid] = []; return next; }); });
			};

			var onCreateProject = function () {
				if (!form.name.trim()) return;
				fetch("/research-project", {
					method: "POST", credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: form.name.trim(), description: form.description || null, domain: form.domain || null }),
				})
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (j && j.code === 0) { setForm({ name: "", description: "", domain: "" }); setMsg("项目已创建 ✓"); reload(); }
						else setMsg("创建失败：" + ((j && j.message) || ""));
					})
					.catch(function () { setMsg("网络错误"); });
			};

			var onDeleteProject = function (id, name) {
				if (!window.confirm("删除项目「" + name + "」？其下论文与文件夹将一并删除")) return;
				fetch("/research-project/" + id, { method: "DELETE", credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						setMsg((j && j.code === 0) ? "项目已删除" : "删除失败：" + ((j && j.message) || ""));
						if (j && j.code === 0) reload();
					})
					.catch(function () { setMsg("网络错误"); });
			};

			var onCreateFolder = function (pid) {
				var name = (folderInput[pid] || "").trim();
				if (!name) return;
				fetch("/research-folder/folders", {
					method: "POST", credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ projectId: pid, name: name }),
				})
					.then(function (r) { return r.json(); })
					.then(function (j) {
						setMsg((j && j.code === 0) ? "文件夹已创建" : "创建失败：" + ((j && j.message) || ""));
						setTreeData(function (prev) { var next = Object.assign({}, prev); delete next[pid]; return next; });
						loadTree(pid);
					})
					.catch(function () { setMsg("网络错误"); });
			};

			var onDeleteFolder = function (id) {
				if (!window.confirm("删除该文件夹？其下子文件夹一并删除")) return;
				fetch("/research-folder/folders/" + id, { method: "DELETE", credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) { setMsg((j && j.code === 0) ? "文件夹已删除" : "删除失败：" + ((j && j.message) || "")); })
					.catch(function () { setMsg("网络错误"); });
			};

			var inputStyle = { width: "100%", boxSizing: "border-box", padding: 7, borderRadius: 8, border: "1px solid var(--dsw-border, #ddd)", fontSize: 13, fontFamily: "inherit", background: "var(--dsw-surface, #fff)", color: "var(--dsw-fg, #333)" };
			var smallBtn = { padding: "3px 10px", borderRadius: 6, border: "1px solid var(--dsw-border, #ddd)", background: "var(--dsw-surface-2, #f5f5f5)", fontSize: 11, cursor: "pointer", color: "var(--dsw-fg, #333)" };

			var renderFolder = function (node, depth) {
				return React.createElement("div", { key: node.id, style: { paddingLeft: depth * 16 } },
					React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "3px 0" } },
						React.createElement("span", { style: { fontSize: 12 } }, "📁 " + node.name),
						React.createElement("button", { onClick: function () { onDeleteFolder(node.id); }, style: smallBtn }, "删除"),
					),
					(node.children || []).map(function (c) { return renderFolder(c, depth + 1); }),
				);
			};

			if (data.loading) {
				return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: 12, margin: "8px 0", color: "var(--dsw-fg-muted, #888)", fontSize: 13 } }, "📂 加载项目中…");
			}

			var projectEls = data.projects.map(function (p) {
				var tree = treeData[p.id];
				return React.createElement("div", { key: p.id, style: { border: "1px solid var(--dsw-border, #eee)", borderRadius: 8, padding: 10, marginBottom: 8 } },
					React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } },
						React.createElement("div", null,
							React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, p.name),
							React.createElement("span", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #999)", marginLeft: 8 } }, [p.domain, "created " + String(p.createdTime || "").slice(0, 10)].filter(Boolean).join(" · ")),
						),
						React.createElement("div", { style: { display: "flex", gap: 6 } },
							React.createElement("button", { onClick: function () { loadTree(p.id); }, style: smallBtn }, "文件夹"),
							React.createElement("button", { onClick: function () { onDeleteProject(p.id, p.name); }, style: Object.assign({}, smallBtn, { color: "#c0392b" }) }, "删除项目"),
						),
					),
					p.description ? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)", marginBottom: 4 } }, p.description) : null,
					React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 4 } },
						React.createElement("input", { value: folderInput[p.id] || "", onChange: function (e) { setFolderInput(function (prev) { var n = Object.assign({}, prev); n[p.id] = e.target.value; return n; }); }, placeholder: "新文件夹名…", style: Object.assign({}, inputStyle, { width: 180 }) }),
						React.createElement("button", { onClick: function () { onCreateFolder(p.id); }, style: smallBtn }, "新建文件夹"),
					),
					tree !== undefined
						? React.createElement("div", { style: { marginTop: 6, borderTop: "1px solid var(--dsw-border, #f0f0f0)", paddingTop: 4 } },
							tree.length === 0
								? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #999)" } }, "（无文件夹）")
								: tree.map(function (n) { return renderFolder(n, 0); }),
						)
						: null,
				);
			});

			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "📂 ResearchOS 项目管理"),
				React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 10 } },
					React.createElement("input", { value: form.name, onChange: function (e) { setForm(Object.assign({}, form, { name: e.target.value })); }, placeholder: "新项目名称", style: Object.assign({}, inputStyle, { flex: 2 }) }),
					React.createElement("input", { value: form.domain, onChange: function (e) { setForm(Object.assign({}, form, { domain: e.target.value })); }, placeholder: "领域（可选）", style: Object.assign({}, inputStyle, { flex: 1 }) }),
					React.createElement("button", { onClick: onCreateProject, style: { padding: "6px 16px", borderRadius: 8, border: "none", background: "var(--dsw-accent, #2563eb)", color: "#fff", fontSize: 13, cursor: "pointer" } }, "新建"),
				),
				msg ? React.createElement("div", { style: { fontSize: 12, color: msg.indexOf("✓") !== -1 ? "#2e7d32" : "#c0392b", marginBottom: 8 } }, msg) : null,
				data.error ? React.createElement("div", { style: { fontSize: 12, color: "#c0392b" } }, "加载失败（" + data.error + "），请先登录 ResearchOS") : null,
				data.projects.length === 0 && !data.error
					? React.createElement("div", { style: { fontSize: 13, color: "var(--dsw-fg-muted, #888)" } }, "暂无项目，请先创建")
					: projectEls,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(projectDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-project" },
					ProjectView,
				);
			});
		};

		return module.exports;
	}
});
