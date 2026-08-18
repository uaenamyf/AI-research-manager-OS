// Phase 4 ui-research-paper — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node that renders a full Paper Intelligence Card
// when the agent reads a paper via the research MCP literature_get tool.
// Same standard tool/call + tool/result event matching as ui-deliverables /
// ui-research-library: the tool name is tracked from tool/call via callId,
// and the tool/result JSON payload (metadata + summary) is rendered.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-paper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var GET_TOOL = "mcp__research__literature_get";

		// ── Definition: turn-scoped accumulator of paper detail ──
		var paperDefinition = {
			kind: "research-paper",
			target: "chat",
			match: function (event) {
				if (event.type === "turn/start") return { id: String(event.data.turn), role: "start" };
				if (event.type === "tool/call") return { id: String(event.data.turn), role: "update" };
				if (event.type === "tool/result") return { id: String(event.data.turn), role: "update" };
				return null;
			},
			start: function (_context, match) {
				if (match.event.type !== "turn/start") throw new Error("research-paper requires turn/start");
				return { turn: match.event.data.turn, calls: {}, paper: null };
			},
			update: function (context, match) {
				var ev = match.event;
				if (ev.type === "tool/call") {
					var name = ev.data && ev.data.name;
					if (name !== GET_TOOL) return context.state;
					var calls = Object.assign({}, context.state.calls);
					calls[String(ev.data.callId)] = name;
					return { turn: context.state.turn, calls: calls, paper: context.state.paper };
				}
				if (ev.type !== "tool/result") return context.state;
				var msg = ev.data && ev.data.message;
				var callId = msg && msg.source && String(msg.source.callId);
				if (context.state.calls[callId] !== GET_TOOL) return context.state;
				var item = msg && msg.content && msg.content[0];
				if (!item || item.isError === true) return context.state;
				var text = "";
				var payload = item.content;
				if (Array.isArray(payload)) {
					for (var i = 0; i < payload.length; i++) {
						if (payload[i] && payload[i].type === "text") text += payload[i].text;
					}
				}
				var parsed = null;
				try { parsed = JSON.parse(text); } catch (e) { return context.state; }
				if (!parsed || parsed.id == null) return context.state;
				return { turn: context.state.turn, calls: context.state.calls, paper: parsed };
			},
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.paper) return null;
				var location = context.start && context.start.location
					? context.start.location
					: (context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" });
				var anchorSeq = context.start
					? context.start.event.seq
					: (context.matches && context.matches[0] ? context.matches[0].event.seq : 0);
				return {
					key: context.key,
					kind: "research-paper",
					id: context.id,
					target: "chat",
					anchorSeq: anchorSeq,
					location: location,
					visibility: "visible",
					data: { paper: context.state.paper },
				};
			},
		};

		// ── Renderer: full Paper Intelligence Card ──
		function PaperCardView(props) {
			var paper = props.node.data.paper || {};
			var summary = paper.summary || {};

			var row = function (label, value) {
				if (!value) return null;
				return React.createElement("div", { style: { marginBottom: 8 } },
					React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--dsw-fg-muted, #999)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 } }, label),
					React.createElement("div", { style: { fontSize: 13, lineHeight: 1.5 } }, value),
				);
			};
			var tags = Array.isArray(summary.tags) ? summary.tags : [];
			var tagEls = tags.map(function (t, i) {
				return React.createElement("span", { key: i, style: { display: "inline-block", padding: "2px 8px", margin: "0 6px 4px 0", borderRadius: 999, fontSize: 11, background: "var(--dsw-surface-2, #f0f0f0)", color: "var(--dsw-fg, #333)" } },
					t.name + (t.category ? " · " + t.category : ""),
				);
			});
			var meta = [paper.year, paper.status, paper.doi || summary.doi].filter(Boolean).join(" · ");
			var header = React.createElement("div", { style: { marginBottom: 10 } },
				React.createElement("div", { style: { fontSize: 15, fontWeight: 700, lineHeight: 1.4, marginBottom: 3 } }, paper.title || summary.title || "(no title)"),
				paper.authors ? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)", marginBottom: 2 } }, paper.authors) : null,
				React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #999)" } }, meta),
			);
			var body = React.createElement("div", { style: { marginTop: 8 } },
				row("Abstract", summary.abstract),
				row("Method", summary.method),
				row("Finding", summary.finding),
				row("Limitation", summary.limitation),
				row("Future Work", summary.future_work),
				tagEls.length ? React.createElement("div", { style: { marginTop: 6 } }, tagEls) : null,
			);
			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 6 } }, "📄 ResearchOS Paper Card"),
				header,
				body,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(paperDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-paper" },
					PaperCardView,
				);
			});
		};

		return module.exports;
	}
});
