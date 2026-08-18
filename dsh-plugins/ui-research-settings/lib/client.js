// Phase 4 ui-research-settings — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// (设置/settings/配置/config). The renderer loads /research-settings (llm /
// translation / knowledge), shows an editable form, and PATCHes the changes
// back on save.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var TRIGGERS = ["设置", "settings", "配置", "config"];

		function isTrigger(text) {
			if (typeof text !== "string") return false;
			var t = text.toLowerCase();
			for (var i = 0; i < TRIGGERS.length; i++) {
				if (t.indexOf(TRIGGERS[i]) !== -1) return true;
			}
			return false;
		}

		// ── Definition: one-shot node on a triggering user message ──
		var settingsDefinition = {
			kind: "research-settings",
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
				if (!isTrigger(text)) return null;
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
					kind: "research-settings",
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

		// ── Renderer: settings editor ──
		function SettingsView(props) {
			var state = React.useState({ loading: true, form: null, saved: null, error: null });
			var data = state[0];
			var setData = state[1];
			var saving = React.useState(false);
			var isSaving = saving[0];
			var setIsSaving = saving[1];

			React.useEffect(function () {
				var cancelled = false;
				fetch("/research-settings", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (cancelled) return;
						if (j && j.code === 0) {
							var s = j.data || {};
							var llm = s.llm || {};
							var tr = s.translation || {};
							var kn = s.knowledge || {};
							setData({
								loading: false,
								form: {
									provider: llm.provider || "",
									baseUrl: llm.baseUrl || "",
									defaultModel: llm.defaultModel || "",
									temperature: llm.temperature != null ? String(llm.temperature) : "",
									defaultMode: tr.defaultMode || "",
									defaultTargetLang: tr.defaultTargetLang || "",
									machineProvider: tr.machineProvider || "",
									retrieveTopK: kn.retrieveTopK != null ? String(kn.retrieveTopK) : "",
								},
								saved: null, error: null,
							});
						} else {
							setData({ loading: false, form: null, saved: null, error: (j && j.code === 401) ? "sign in" : "load err" });
						}
					})
					.catch(function () { if (!cancelled) setData({ loading: false, form: null, saved: null, error: "no api" }); });
				return function () { cancelled = true; };
			}, []);

			var set = function (key) {
				return function (e) {
					var form = Object.assign({}, data.form);
					form[key] = e.target.value;
					setData(Object.assign({}, data, { form: form, saved: null }));
				};
			};

			var onSave = function () {
				if (!data.form || isSaving) return;
				setIsSaving(true);
				var f = data.form;
				var patch = {
					llm: {
						...(f.provider ? { provider: f.provider } : {}),
						...(f.baseUrl ? { baseUrl: f.baseUrl } : {}),
						...(f.defaultModel ? { defaultModel: f.defaultModel } : {}),
						...(f.temperature ? { temperature: Number(f.temperature) } : {}),
					},
					translation: {
						...(f.defaultMode ? { defaultMode: f.defaultMode } : {}),
						...(f.defaultTargetLang ? { defaultTargetLang: f.defaultTargetLang } : {}),
						...(f.machineProvider ? { machineProvider: f.machineProvider } : {}),
					},
					knowledge: f.retrieveTopK ? { retrieveTopK: Number(f.retrieveTopK) } : {},
				};
				fetch("/research-settings", {
					method: "PATCH",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch),
				})
					.then(function (r) { return r.json(); })
					.then(function (j) {
						setData(Object.assign({}, data, { saved: j && j.code === 0 ? "已保存 ✓" : ("保存失败: " + ((j && j.message) || "")) }));
					})
					.catch(function () { setData(Object.assign({}, data, { saved: "保存失败（网络错误）" })); })
					.then(function () { setIsSaving(false); });
			};

			if (data.loading) {
				return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: 12, margin: "8px 0", color: "var(--dsw-fg-muted, #888)", fontSize: 13 } }, "⚙️ 加载设置中…");
			}
			if (!data.form) {
				return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: 12, margin: "8px 0", fontSize: 13, color: "#c0392b" } }, "设置加载失败（" + (data.error || "") + "），请先登录 ResearchOS");
			}

			var inputStyle = { width: "100%", boxSizing: "border-box", padding: 6, borderRadius: 6, border: "1px solid var(--dsw-border, #ddd)", fontSize: 12, fontFamily: "inherit", background: "var(--dsw-surface, #fff)", color: "var(--dsw-fg, #333)" };
			var field = function (label, key, ph) {
				return React.createElement("div", { style: { marginBottom: 6 } },
					React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, label),
					React.createElement("input", { value: data.form[key] || "", onChange: set(key), placeholder: ph || "", style: inputStyle }),
				);
			};
			var section = function (title, children) {
				return React.createElement("div", { style: { marginBottom: 10 } },
					React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--dsw-fg-muted, #999)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, title),
					children,
				);
			};

			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "⚙️ ResearchOS 设置"),
				section("LLM 配置", [
					field("Provider", "provider", "openai / anthropic / deepseek"),
					field("Base URL", "baseUrl", "https://…"),
					field("默认模型", "defaultModel", "model name"),
					field("温度 (0-2)", "temperature", "0.7"),
				]),
				section("翻译配置", [
					field("默认模式", "defaultMode", "machine / llm"),
					field("默认目标语言", "defaultTargetLang", "zh-CN"),
					field("机器翻译提供商", "machineProvider", "mymemory / google / deepl"),
				]),
				section("Knowledge / RAG", [
					field("检索 top_k", "retrieveTopK", "8"),
				]),
				React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
					React.createElement("span", { style: { fontSize: 12, color: data.saved && data.saved.indexOf("✓") !== -1 ? "#2e7d32" : "#c0392b" } }, data.saved || ""),
					React.createElement("button", { onClick: onSave, disabled: isSaving, style: { padding: "6px 20px", borderRadius: 8, border: "none", background: "var(--dsw-accent, #2563eb)", color: "#fff", fontSize: 13, cursor: "pointer", opacity: isSaving ? 0.6 : 1 } }, isSaving ? "保存中…" : "保存"),
				),
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(settingsDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-settings" },
					SettingsView,
				);
			});
		};

		return module.exports;
	}
});
