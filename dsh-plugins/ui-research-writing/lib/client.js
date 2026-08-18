// Phase 4 ui-research-writing — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// (写作/改写/润色/翻译/回复审稿/Cover letter / writing / polish / rewrite /
// translate / shorten...). The Definition extracts the intended action and the
// trailing text from the message; the renderer shows a writing panel that
// calls /research-writing/rewrite and displays the result.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-writing",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var ACTIONS = [
			{ id: "polish", label: "润色" },
			{ id: "expand", label: "扩写" },
			{ id: "shorten", label: "缩写" },
			{ id: "translate", label: "翻译" },
			{ id: "rebuttal", label: "回复审稿" },
			{ id: "cover_letter", label: "Cover Letter" },
		];

		var KEYWORD_ACTIONS = [
			{ re: /(润色|polish)/i, action: "polish" },
			{ re: /(扩写|expand)/i, action: "expand" },
			{ re: /(缩写|缩短|shorten)/i, action: "shorten" },
			{ re: /(翻译|translate)/i, action: "translate" },
			{ re: /(审稿|rebuttal)/i, action: "rebuttal" },
			{ re: /(cover\s*letter|投稿信)/i, action: "cover_letter" },
		];

		var TRIGGER = /(写作|改写|润色|扩写|缩写|缩短|翻译|审稿|cover\s*letter|writing|polish|rewrite|translate|shorten)/i;

		function extractIntent(text) {
			// Find the first trigger keyword; text after it becomes the initial text.
			var m = TRIGGER.exec(text || "");
			var initialText = "";
			if (m) {
				initialText = text.slice(m.index + m[0].length)
					.replace(/^[:：,，\s]+/, "")
					.replace(/^(这段|这段文字|以下|以下内容|这个|这些|文本|内容|文字|the text|this text|the following)[:：,，\s]*/i, "");
			}
			var action = "polish";
			for (var i = 0; i < KEYWORD_ACTIONS.length; i++) {
				if (KEYWORD_ACTIONS[i].re.test(text || "")) { action = KEYWORD_ACTIONS[i].action; break; }
			}
			return { action: action, initialText: initialText };
		}

		// ── Definition: one-shot node on a triggering user message ──
		var writingDefinition = {
			kind: "research-writing",
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
				var text = "";
				var content = match.event.data && match.event.data.content;
				if (Array.isArray(content)) {
					for (var i = 0; i < content.length; i++) {
						if (content[i] && content[i].type === "text") text += content[i].text;
					}
				}
				var intent = extractIntent(text);
				return { at: match.event.seq, triggered: true, action: intent.action, initialText: intent.initialText };
			},
			update: function (context) { return context.state; },
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.triggered) return null;
				return {
					key: context.key,
					kind: "research-writing",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.at,
					location: context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" },
					visibility: "visible",
					data: { action: context.state.action, initialText: context.state.initialText },
				};
			},
		};

		// ── Renderer: writing panel ──
		function WritingView(props) {
			var data = props.node.data || {};
			var textState = React.useState(data.initialText || "");
			var text = textState[0];
			var setText = textState[1];
			var actionState = React.useState(data.action || "polish");
			var action = actionState[0];
			var setAction = actionState[1];
			var instructionState = React.useState("");
			var instruction = instructionState[0];
			var setInstruction = instructionState[1];
			var resultState = React.useState(null);
			var result = resultState[0];
			var setResult = resultState[1];
			var busyState = React.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];

			var onRewrite = function () {
				if (!text.trim() || busy) return;
				setBusy(true);
				setResult(null);
				fetch("/research-writing/rewrite", {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: text, action: action, instruction: instruction }),
				})
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (j && j.code === 0) setResult({ ok: true, text: j.data.text });
						else setResult({ ok: false, text: (j && j.message) || "改写失败" });
					})
					.catch(function () { setResult({ ok: false, text: "网络错误" }); })
					.then(function () { setBusy(false); });
			};

			var optionEls = ACTIONS.map(function (a) {
				return React.createElement("option", { key: a.id, value: a.id }, a.label);
			});
			var resultEl = null;
			if (result) {
				resultEl = React.createElement("div", { style: { marginTop: 8, padding: 10, borderRadius: 8, background: "var(--dsw-surface-2, #f7f7f7)", border: "1px solid var(--dsw-border, #eee)", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5, color: result.ok ? "var(--dsw-fg, #333)" : "#c0392b" } }, result.text);
			}
			var inputStyle = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 8, border: "1px solid var(--dsw-border, #ddd)", fontSize: 13, fontFamily: "inherit", background: "var(--dsw-surface, #fff)", color: "var(--dsw-fg, #333)" };

			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "✍️ ResearchOS 写作助手"),
				React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 8 } },
					React.createElement("select", { value: action, onChange: function (e) { setAction(e.target.value); }, style: Object.assign({ width: 130 }, inputStyle) }, optionEls),
					React.createElement("input", { value: instruction, onChange: function (e) { setInstruction(e.target.value); }, placeholder: "额外指令（如：翻译成中文 / 审稿意见…）", style: Object.assign({ flex: 1 }, inputStyle) }),
				),
				React.createElement("textarea", { value: text, onChange: function (e) { setText(e.target.value); }, placeholder: "输入要处理的文本…", rows: 4, style: Object.assign({ resize: "vertical" }, inputStyle) }),
				React.createElement("div", { style: { marginTop: 8, textAlign: "right" } },
					React.createElement("button", { onClick: onRewrite, disabled: busy || !text.trim(), style: { padding: "6px 20px", borderRadius: 8, border: "none", background: "var(--dsw-accent, #2563eb)", color: "#fff", fontSize: 13, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "改写中…" : "改写"),
				),
				resultEl,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(writingDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-writing" },
					WritingView,
				);
			});
		};

		return module.exports;
	}
});
