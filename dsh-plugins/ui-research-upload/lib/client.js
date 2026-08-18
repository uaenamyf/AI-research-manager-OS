// Phase 4 ui-research-upload — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// (上传/upload/上传文献/上传论文). The renderer shows an upload panel:
//   - project picker (/research-project list)
//   - folder picker (root folders of the chosen project, optional)
//   - PDF file input
// Upload flow:
//   1. POST /research-file/upload-url { fileName, contentType } -> { url, fields.key }
//   2. POST { url } (multipart FormData: file + key) -> store the file
//   3. POST /research-paper/projects/:pid/papers { fileName, s3Key, folderId } -> { id, status }
//   4. show paper id + PROCESSING (MQ analysis already triggered)
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-upload",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var TRIGGER = /(上传|upload|上传文献|上传论文)/i;

		// ── Definition: one-shot node on a triggering user message ──
		var uploadDefinition = {
			kind: "research-upload",
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
					kind: "research-upload",
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

		// ── Renderer: upload panel ──
		function UploadView(props) {
			var projectsState = React.useState(null);
			var projects = projectsState[0];
			var setProjects = projectsState[1];
			var projectIdState = React.useState("");
			var projectId = projectIdState[0];
			var setProjectId = projectIdState[1];
			var foldersState = React.useState(null);
			var folders = foldersState[0];
			var setFolders = foldersState[1];
			var folderIdState = React.useState("");
			var folderId = folderIdState[0];
			var setFolderId = folderIdState[1];
			var fileState = React.useState(null);
			var file = fileState[0];
			var setFile = fileState[1];
			var logState = React.useState([]);
			var logs = logState[0];
			var setLogs = logState[1];
			var busyState = React.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];

			// Load projects on mount.
			React.useEffect(function () {
				var cancelled = false;
				fetch("/research-project?page=0&size=100", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (cancelled) return;
						if (j && j.code === 0) {
							var items = j.data.items || [];
							setProjects(items);
							if (items.length && !projectId) setProjectId(String(items[0].id));
						} else {
							setProjects([]);
						}
					})
					.catch(function () { if (!cancelled) setProjects([]); });
				return function () { cancelled = true; };
			}, []);

			// Load root folders when the project changes.
			React.useEffect(function () {
				if (!projectId) { setFolders(null); setFolderId(""); return; }
				var cancelled = false;
				setFolders(null);
				fetch("/research-folder/projects/" + projectId + "/folders", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (cancelled) return;
						var items = (j && j.code === 0 && j.data) ? j.data : [];
						setFolders(items);
					})
					.catch(function () { if (!cancelled) setFolders([]); });
				return function () { cancelled = true; };
			}, [projectId]);

			var addLog = function (line) { setLogs(function (prev) { return prev.concat([line]); }); };

			var onUpload = function () {
				if (!file || !projectId || busy) return;
				setBusy(true);
				setLogs([]);
				var fileName = file.name;
				var contentType = file.type || "application/pdf";
				// 1. presign
				fetch("/research-file/upload-url", {
					method: "POST", credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ fileName: fileName, contentType: contentType }),
				})
					.then(function (r) { return r.json(); })
					.then(function (pu) {
						if (!pu || pu.code !== 0) throw new Error((pu && pu.message) || "presign 失败");
						var url = pu.data.url;
						var key = pu.data.fields.key;
						addLog("① 已获取上传地址");
						// 2. multipart upload
						var fd = new FormData();
						fd.append("file", file);
						fd.append("key", key);
						return fetch(url, { method: "POST", credentials: "include", body: fd })
							.then(function (r) { return r.json(); })
							.then(function (up) {
								if (!up || up.code !== 0) throw new Error((up && up.message) || "文件上传失败");
								addLog("② 文件已存储");
								// 3. create paper (triggers MQ analysis)
								return fetch("/research-paper/projects/" + projectId + "/papers", {
									method: "POST", credentials: "include",
									headers: { "content-type": "application/json" },
									body: JSON.stringify({ fileName: fileName, s3Key: key, folderId: folderId || null }),
								});
							});
					})
					.then(function (r) { return r.json(); })
					.then(function (cp) {
						if (!cp || cp.code !== 0) throw new Error((cp && cp.message) || "创建论文失败");
						addLog("③ 论文已创建 paper#" + cp.data.id + "（" + cp.data.status + "），AI 分析已触发");
					})
					.catch(function (e) { addLog("✗ " + (e.message || "上传失败")); })
					.then(function () { setBusy(false); });
			};

			var inputStyle = { width: "100%", boxSizing: "border-box", padding: 7, borderRadius: 8, border: "1px solid var(--dsw-border, #ddd)", fontSize: 13, fontFamily: "inherit", background: "var(--dsw-surface, #fff)", color: "var(--dsw-fg, #333)" };
			var projOpts = (projects || []).map(function (p) { return React.createElement("option", { key: p.id, value: String(p.id) }, p.name); });
			var folderOpts = (folders || []).map(function (f) { return React.createElement("option", { key: f.id, value: String(f.id) }, f.name); });
			var logEls = logs.map(function (l, i) { return React.createElement("div", { key: i, style: { fontSize: 12, lineHeight: 1.6, color: l.indexOf("✗") === 0 ? "#c0392b" : "var(--dsw-fg, #333)" } }, l); });

			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "📤 ResearchOS 上传文献"),
				React.createElement("div", { style: { marginBottom: 8 } },
					React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, "目标项目"),
					projects === null
						? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)" } }, "加载项目…")
						: (projects.length === 0
							? React.createElement("div", { style: { fontSize: 12, color: "#c0392b" } }, "暂无项目，请先创建项目")
							: React.createElement("select", { value: projectId, onChange: function (e) { setProjectId(e.target.value); setFolderId(""); }, style: inputStyle }, projOpts)),
				),
				folders !== null && folders.length > 0
					? React.createElement("div", { style: { marginBottom: 8 } },
						React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, "目标文件夹（可选）"),
						React.createElement("select", { value: folderId, onChange: function (e) { setFolderId(e.target.value); }, style: inputStyle },
							React.createElement("option", { value: "" }, "（根目录）"),
							folderOpts,
						),
					)
					: null,
				React.createElement("div", { style: { marginBottom: 8 } },
					React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, "PDF 文件"),
					React.createElement("input", { type: "file", accept: "application/pdf,.pdf", onChange: function (e) { setFile(e.target.files && e.target.files[0] || null); }, style: inputStyle }),
				),
				React.createElement("div", { style: { textAlign: "right" } },
					React.createElement("button", { onClick: onUpload, disabled: busy || !file || !projectId, style: { padding: "6px 20px", borderRadius: 8, border: "none", background: "var(--dsw-accent, #2563eb)", color: "#fff", fontSize: 13, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "上传中…" : "上传"),
				),
				logEls.length ? React.createElement("div", { style: { marginTop: 8, padding: 8, borderRadius: 8, background: "var(--dsw-surface-2, #f7f7f7)", border: "1px solid var(--dsw-border, #eee)" } }, logEls) : null,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(uploadDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-upload" },
					UploadView,
				);
			});
		};

		return module.exports;
	}
});
