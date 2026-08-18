// Phase 4 feasibility proof — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__). Registers a sidebar
// footer action that calls the research-project bundle and shows the count,
// proving out-of-tree dsh.client packages load in the browser shell.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-hello",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		// ── sidebar footer action: ResearchOS project count probe ──
		function ResearchProbe(props) {
			var state = React.useState("…");
			var label = state[0];
			var setLabel = state[1];
			React.useEffect(function () {
				var cancelled = false;
				fetch("/research-project?size=1", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (cancelled) return;
						if (j && j.code === 0 && j.data && typeof j.data.total === "number") {
							setLabel(String(j.data.total) + " projects");
						} else if (j && j.code === 401) {
							setLabel("sign in");
						} else {
							setLabel("api err");
						}
					})
					.catch(function () { if (!cancelled) setLabel("no api"); });
				return function () { cancelled = true; };
			}, []);
			var style = {
				display: "flex", alignItems: "center", gap: 6,
				padding: "0 12px", height: 32, fontSize: 12,
				color: "var(--dsw-fg-muted, #8b8b8b)", cursor: "default",
				whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
			};
			return React.createElement("div", { style: style, title: "ResearchOS Phase 4 probe" },
				React.createElement("span", { style: { fontSize: 14 } }, "📚"),
				React.createElement("span", null, "ResearchOS · " + label),
			);
		}

		exports.inject = ["slots"];
		exports.apply = function (ctx) {
			ctx.slots.inject("sidebar.footer.action", function () {
				return ctx.slots.register(
					{ name: "sidebar.footer.action" },
					ResearchProbe,
				);
			});
		};

		return module.exports;
	}
});
