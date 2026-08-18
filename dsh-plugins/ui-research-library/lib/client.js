// Phase 4 ui-research-library — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node that turns the research MCP literature tool
// results (literature_search / literature_get) into a rich library card in the
// chat stream. Matches the STANDARD tool/call + tool/result session events
// (same pattern as ui-deliverables), so no host-side event emission is needed:
// the tool name is tracked from tool/call via callId, and the JSON payload of
// the matching tool/result is parsed into the card's data.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-library",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var RESEARCH_TOOLS = [
			"mcp__research__literature_search",
			"mcp__research__literature_get",
			"mcp__research__literature_vector_search",
		];

		function isResearchTool(name) {
			return typeof name === "string" && RESEARCH_TOOLS.indexOf(name) !== -1;
		}

		// ── Definition: turn-scoped accumulator of literature results ──
		var libraryDefinition = {
			kind: "research-library",
			target: "chat",
			match: function (event) {
				if (event.type === "turn/start") return { id: String(event.data.turn), role: "start" };
				if (event.type === "tool/call") return { id: String(event.data.turn), role: "update" };
				if (event.type === "tool/result") return { id: String(event.data.turn), role: "update" };
				return null;
			},
			start: function (_context, match) {
				if (match.event.type !== "turn/start") throw new Error("research-library requires turn/start");
				return { turn: match.event.data.turn, calls: {}, results: [] };
			},
			update: function (context, match) {
				var ev = match.event;
				if (ev.type === "tool/call") {
					var name = ev.data && ev.data.name;
					if (!isResearchTool(name)) return context.state;
					var calls = Object.assign({}, context.state.calls);
					calls[String(ev.data.callId)] = name;
					return { turn: context.state.turn, calls: calls, results: context.state.results };
				}
				if (ev.type !== "tool/result") return context.state;
				var msg = ev.data && ev.data.message;
				var callId = msg && msg.source && String(msg.source.callId);
				var toolName = context.state.calls[callId];
				if (!isResearchTool(toolName)) return context.state;
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
				var results = context.state.results.slice();
				if (toolName.indexOf("literature_search") !== -1) {
					var list = parsed.results || [];
					for (var j = 0; j < list.length; j++) results.push(list[j]);
				} else if (toolName.indexOf("literature_get") !== -1 && parsed.id != null) {
					results.push(parsed);
				}
				return { turn: context.state.turn, calls: context.state.calls, results: results };
			},
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.results.length) return null;
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
					kind: "research-library",
					id: context.id,
					target: "chat",
					anchorSeq: anchorSeq,
					location: location,
					visibility: "visible",
					data: { results: context.state.results.slice(0, 10) },
				};
			},
		};

		// ── Renderer: a rich library card in the chat stream ──
		function LibraryNodeView(props) {
			var results = props.node.data.results || [];
			var rows = results.map(function (p, idx) {
				var title = p.title || "(no title)";
				var meta = [p.year, p.status, p.doi].filter(Boolean).join(" · ");
				var authors = p.authors ? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)" } }, p.authors) : null;
				return React.createElement("div", { key: idx, style: { padding: "7px 0", borderBottom: "1px solid var(--dsw-border, #f0f0f0)" } },
					React.createElement("div", { style: { fontWeight: 600, fontSize: 13, lineHeight: 1.4 } }, title),
					authors,
					React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #999)" } }, meta),
				);
			});
			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "10px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 4 } }, "📚 ResearchOS 文献库"),
				React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)", marginBottom: 4 } }, results.length + " 篇论文"),
				rows,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(libraryDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-library" },
					LibraryNodeView,
				);
			});
		};

		return module.exports;
	}
});
