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
		var useRef = React.useRef;

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
		// IconPersonalizationOutline16 (view options) — workspace header twin.
		function IconViewOptions(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { transform: "translate(1.292 1.3)", d: "M10.3232 9.18164C11.2868 9.18164 12.0985 9.82833 12.3506 10.7109L13.415 10.7109L13.415 11.8711L12.3496 11.8711C12.0971 12.7532 11.2864 13.3994 10.3232 13.3994C9.36031 13.3992 8.55012 12.7531 8.29785 11.8711L0 11.8711L0 10.7109L8.29688 10.7109C8.54876 9.82845 9.35988 9.18186 10.3232 9.18164ZM10.3232 10.3418C9.7999 10.3421 9.37534 10.7667 9.375 11.29C9.375 11.8137 9.79969 12.239 10.3232 12.2393C10.847 12.2393 11.2725 11.8138 11.2725 11.29C11.2721 10.7666 10.8468 10.3418 10.3232 10.3418ZM12.4326 11.291C12.4326 11.3549 12.4284 11.418 12.4229 11.4805C12.4287 11.4181 12.4326 11.355 12.4326 11.291ZM8.21484 11.2832C8.21484 11.2856 8.21484 11.2886 8.21484 11.291L8.21484 11.29C8.21484 11.2878 8.21484 11.2855 8.21484 11.2832ZM3.08301 4.59082C4.04605 4.59095 4.85696 5.23717 5.10938 6.11914L13.415 6.11914L13.415 7.2793L5.11035 7.2793C4.85833 8.16202 4.04648 8.80846 3.08301 8.80859C2.11972 8.80843 1.30963 8.16179 1.05762 7.2793L0 7.2793L0 6.11914L1.05762 6.11914C1.30994 5.23728 2.12006 4.59098 3.08301 4.59082ZM3.08301 5.75098C2.55962 5.75117 2.13512 6.17587 2.13477 6.69922C2.13477 7.22287 2.5594 7.64824 3.08301 7.64844C3.60665 7.64828 4.03223 7.2229 4.03223 6.69922C4.03187 6.17585 3.60643 5.75113 3.08301 5.75098ZM5.19238 6.69922C5.19238 6.763 5.18816 6.82633 5.18262 6.88867C5.18846 6.82629 5.19238 6.76313 5.19238 6.69922C5.19236 6.63495 5.18853 6.57152 5.18262 6.50879C5.18826 6.57154 5.19236 6.635 5.19238 6.69922ZM0.982422 6.52344C0.977382 6.58136 0.97463 6.63999 0.974609 6.69922C0.974609 6.75775 0.977496 6.81579 0.982422 6.87305C0.977758 6.81579 0.974609 6.75767 0.974609 6.69922C0.974628 6.64 0.977618 6.58142 0.982422 6.52344ZM10.3232 0C11.2869 0 12.0986 0.646596 12.3506 1.5293L13.415 1.5293L13.415 2.68945L12.3496 2.68945C12.363 2.64266 12.3754 2.59488 12.3857 2.54688C12.1838 3.50118 11.3376 4.21777 10.3232 4.21777C9.36037 4.21756 8.55018 3.57139 8.29785 2.68945L0 2.68945L0 1.5293L8.29688 1.5293C8.5487 0.646717 9.35981 0.00021854 10.3232 0ZM10.3232 1.16016C9.79984 1.16042 9.37524 1.58499 9.375 2.1084C9.375 2.63201 9.79969 3.05735 10.3232 3.05762C10.847 3.05762 11.2725 2.63217 11.2725 2.1084C11.2722 1.58483 10.8469 1.16016 10.3232 1.16016ZM12.4229 2.29883C12.4287 2.23641 12.4326 2.17331 12.4326 2.10938C12.4326 2.17327 12.4284 2.23638 12.4229 2.29883ZM8.21484 2.10938L8.21484 2.1084L8.21484 2.10938ZM8.22266 1.93359C8.21785 1.98897 8.21506 2.04499 8.21484 2.10156C8.21503 2.04501 8.2181 1.98902 8.22266 1.93359ZM8.22266 11.1162C8.2179 11.1713 8.21507 11.227 8.21484 11.2832C8.21504 11.227 8.21814 11.1713 8.22266 11.1162Z", fill: "currentColor" }),
			);
		}
		// IconProjectAddOutline16 (add folder) — workspace header twin.
		function IconFolderAdd(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { transform: "translate(9.52 2.52)", d: "M3.55246 0L3.55246 2.44252L6 2.44252L6 3.55748L3.55246 3.55748L3.55246 6L2.43834 6L2.43834 3.55748L0 3.55748L0 2.44252L2.43834 2.44252L2.43834 0L3.55246 0Z", fill: "currentColor" }),
				React.createElement("path", { transform: "translate(0.3496 2.35)", d: "M4.76367 0C5.36861 1.80598e-05 5.93113 0.310294 6.25488 0.821289L6.78027 1.64941C6.79685 1.67558 6.81791 1.69775 6.83887 1.71973C6.72186 2.15521 6.65702 2.61192 6.65137 3.08301C6.25601 2.96045 5.90909 2.70478 5.68164 2.3457L5.15723 1.5166C5.07183 1.38189 4.92318 1.3008 4.76367 1.30078L2.32422 1.30078C1.7589 1.30078 1.30078 1.7589 1.30078 2.32422L1.30078 10.1338C1.30078 10.6991 1.7589 11.1572 2.32422 11.1572L11.9766 11.1572C12.5419 11.1572 13 10.6991 13 10.1338L13 8.58398C13.4545 8.5135 13.8903 8.38748 14.3008 8.21289L14.3008 10.1338C14.3008 11.4171 13.2598 12.458 11.9766 12.458L2.32422 12.458C1.04093 12.458 0 11.4171 0 10.1338L0 2.32422C0 1.04093 1.04093 0 2.32422 0L4.76367 0Z", fill: "currentColor" }),
			);
		}
		// IconEllipsisOutline16 (row ⋯ menu) — workspace row twin.
		function IconEllipsis(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z", fill: "currentColor" }),
				React.createElement("path", { d: "M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z", fill: "currentColor" }),
				React.createElement("path", { d: "M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z", fill: "currentColor" }),
			);
		}
		// IconPlusOutline16 (row add) — workspace row twin.
		function IconPlus(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z", fill: "currentColor" }),
			);
		}
		// IconTriangleRightFill14 (expand arrow) — workspace row twin. Forwards
		// className so the `.dsh-rr-arrow` rotation animation can apply.
		function IconChevronRight(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg", className: props.className },
				React.createElement("path", { d: "M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z", fill: "currentColor" }),
			);
		}
		// IconEditOutline16 (rename) — workspace row menu twin.
		function IconEdit(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z", fill: "currentColor" }),
			);
		}
		// IconTrashOutline16 (delete) — workspace row menu twin.
		function IconTrash(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z", fill: "currentColor" }),
			);
		}
		// IconFolderOpen16 / IconFolderClose16 — workspace folder row glyphs.
		function IconFolderOpen(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z", fill: "currentColor" }),
			);
		}
		function IconFolderClose(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { transform: "translate(1.5 2.429)", d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z", fill: "currentColor" }),
			);
		}
		// IconCheckOutline16 — menu selection checkmark (workspace Menu twin).
		function IconCheck(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313L13.9502 3.07422L15.0498 3.92579Z", fill: "currentColor" }),
			);
		}

		// Workspace-consistent motion (mirrors ui-workspace: 150ms row-in,
		// 200ms wide-in, 180ms ease transitions; reduced-motion respected).
		// Injected once; inline styles cannot carry @keyframes.
		(function ensureMotion() {
			if (window.__dshResearchMotion) return;
			window.__dshResearchMotion = true;
			var st = document.createElement("style");
			st.textContent = [
				"@keyframes dsh-rr-row-in { from { opacity: 0; } }",
				"@keyframes dsh-rr-wide-in { from { opacity: 0; } }",
				".dsh-rr-row { animation: dsh-rr-row-in 150ms var(--ds-ease-in-out, ease); }",
				".dsh-rr-wide { animation: dsh-rr-wide-in 200ms var(--ds-ease-in-out, ease); }",
				".dsh-rr-fade { transition: opacity 120ms var(--ds-ease-in-out, ease); }",
				// Folder/project row (workspace .projectRow 34px)
				".dsh-rr-frow { display: flex; align-items: center; gap: 6px; height: 34px; border-radius: 8px; padding: 0 8px; cursor: pointer; user-select: none; box-sizing: border-box; color: var(--dsw-alias-label-primary, #111); }",
				".dsh-rr-frow:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }",
				// Paper row (workspace .sessionRow 32px)
				".dsh-rr-prow { display: flex; align-items: center; gap: 0; height: 32px; border-radius: 8px; padding: 0 8px; cursor: pointer; user-select: none; box-sizing: border-box; color: var(--dsw-alias-label-primary, #111); animation: dsh-rr-row-in 150ms var(--ds-ease-in-out, ease); }",
				".dsh-rr-prow:hover, .dsh-rr-prow.dsh-rr-on { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }",
				// 16px leading slot (status dot / folder glyph)
				".dsh-rr-slot { flex: none; width: 16px; height: 20px; display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary, #999); }",
				// Folder hover swap: folder glyph -> chevron; arrow rotates when open
				".dsh-rr-frow .dsh-rr-chevron { display: none; }",
				".dsh-rr-frow:hover .dsh-rr-chevron { display: inline-flex; }",
				".dsh-rr-frow:hover .dsh-rr-ficon { display: none; }",
				".dsh-rr-arrow { transition: transform 150ms var(--ds-ease-in-out, ease); }",
				".dsh-rr-arrow.dsh-rr-open { transform: rotate(90deg); }",
				// Titles
				".dsh-rr-ftitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; }",
				".dsh-rr-ptitle { flex: 1; min-width: 0; margin: 0 6px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; }",
				// Trailing time, hidden on hover to reveal actions
				".dsh-rr-time { flex: none; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-tertiary, #999); }",
				".dsh-rr-prow:hover .dsh-rr-time { display: none; }",
				// Row actions surface on hover only (workspace .rowActions)
				".dsh-rr-actions { flex: none; display: none; align-items: center; gap: 12px; }",
				".dsh-rr-frow:hover .dsh-rr-actions, .dsh-rr-prow:hover .dsh-rr-actions { display: inline-flex; }",
				".dsh-rr-iconbtn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: none; border-radius: 4px; padding: 0; background: transparent; cursor: pointer; color: var(--dsw-alias-label-tertiary, #999); }",
				".dsh-rr-iconbtn:hover { color: var(--dsw-alias-label-primary, #111); }",
				// Fixed dropdown menu (mirrors primitives Menu surface)
				".dsh-rr-menu { position: fixed; z-index: 60; min-width: 148px; padding: 4px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); background: var(--dsw-alias-bg-layer-2, #fff); box-shadow: 0 8px 24px rgba(0,0,0,.12); }",
				".dsh-rr-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; font-size: 13px; color: var(--dsw-alias-label-primary, #111); cursor: pointer; text-align: left; }",
				".dsh-rr-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }",
				".dsh-rr-menu-item.dsh-rr-danger { color: var(--dsw-alias-state-error-primary, #dc2626); }",
				".dsh-rr-menu-label { padding: 4px 10px 2px; font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); }",
				".dsh-rr-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2, rgba(0,0,0,.08)); }",
				".dsh-rr-menu-ic { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: var(--dsw-alias-label-tertiary, #999); }",
				".dsh-rr-searchinput::placeholder { color: var(--dsw-alias-label-tertiary, #999); }",
				// Right-column research seat result cards (aligned to dsh
				// DetailsPanel: block cards, not tree rows).
				".dsh-rr-card { display: block; padding: 8px 12px; margin: 0 0 6px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); background: var(--dsw-alias-bg-layer-1, #fff); cursor: pointer; box-sizing: border-box; }",
				".dsh-rr-card:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); border-color: var(--dsw-alias-border-l3, rgba(0,0,0,.2)); }",
				".dsh-rr-badge { display: inline-block; flex: none; padding: 1px 7px; border-radius: 999px; font-size: 11px; line-height: 16px; background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: var(--dsw-alias-label-secondary, #666); }",
				".dsh-rr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #999); }",
				".dsh-rr-abst { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #666); white-space: normal; }",
				// Detail view tabs (PDF preview / Paper Card) — mirrors the
				// DetailsPanel tab strip look: 13px labels, accent underline.
				".dsh-rr-tabs { display: flex; align-items: center; gap: 2px; margin: 0 0 8px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }",
				".dsh-rr-tab { flex: none; padding: 8px 12px 7px; border: none; border-bottom: 2px solid transparent; background: transparent; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary, #666); cursor: pointer; }",
				".dsh-rr-tab:hover { color: var(--dsw-alias-label-primary, #111); }",
				".dsh-rr-tab.dsh-rr-tab-on { color: var(--dsw-alias-label-primary, #111); border-bottom-color: var(--dsw-alias-button-primary-fill, #2563eb); font-weight: 500; }",
				// Modal overlay + card (mirrors primitives Modal family)
				".dsh-rr-overlay { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.5)); }",
				".dsh-rr-modal { width: 320px; max-width: calc(100vw - 32px); padding: 16px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #fff); box-shadow: 0 16px 48px rgba(0,0,0,.2); }",
				"@media (prefers-reduced-motion: reduce) { .dsh-rr-row, .dsh-rr-prow, .dsh-rr-wide { animation: none; } .dsh-rr-fade, .dsh-rr-arrow { transition: none; } }",
			].join("\n");
			document.head.appendChild(st);
		})();

		// ── shared styles: geometry mirrored 1:1 from ui-workspace ───────
		var S = {
			// region column
			root: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", boxSizing: "border-box", paddingRight: INSET },
			// workspace list (the only scrolling region)
			list: { flex: 1, minHeight: 0, overflowY: "auto", marginLeft: -4, marginRight: SCROLL_OFF, paddingLeft: 4, paddingRight: "calc(" + INSET + " - " + SCROLL_W + "px - " + SCROLL_OFF + "px)", paddingBottom: 16, scrollbarGutter: "stable" },
			// section header (workspace .sectionHeader)
			header: { flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, height: 36, paddingLeft: 4, marginTop: 2, marginRight: -4, marginBottom: 4, boxSizing: "border-box", borderRadius: 12, overflow: "hidden", color: "var(--dsw-alias-label-tertiary, #999)" },
			// section label (workspace .sectionLabel — inherits tertiary from header)
			label: { flex: "none", maxWidth: "45%", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-tertiary, #999)", transition: "max-width 180ms var(--ds-ease-in-out, ease), opacity 120ms var(--ds-ease-in-out, ease), transform 180ms var(--ds-ease-in-out, ease), margin-right 180ms var(--ds-ease-in-out, ease)" },
			labelHidden: { maxWidth: 0, marginRight: -4, opacity: 0, transform: "translateX(-4px)" },
			// inline search slot (workspace .searchSlot) — grows in place
			searchSlot: { flex: 1, maxWidth: 28, minWidth: 0, display: "flex", alignItems: "center", marginLeft: "auto", paddingLeft: 0, boxSizing: "border-box", transition: "max-width 180ms var(--ds-ease-in-out, ease)" },
			searchSlotOn: { maxWidth: "100%" },
			// search capsule (workspace .search) — 28px circle expands to 30px pill
			search: { flex: "none", display: "flex", alignItems: "center", gap: 0, width: "100%", height: 28, margin: 0, padding: 0, boxSizing: "border-box", border: "none", borderRadius: "50%", background: "transparent", cursor: "text", color: "var(--dsw-alias-label-secondary, #666)", overflow: "hidden", transition: "width 180ms var(--ds-ease-in-out, ease), height 180ms var(--ds-ease-in-out, ease), padding 180ms var(--ds-ease-in-out, ease), border-color 180ms var(--ds-ease-in-out, ease), border-radius 180ms var(--ds-ease-in-out, ease)" },
			searchOn: { width: "calc(100% + 4px)", height: 30, marginInline: -2, padding: "0 4px 0 0", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 10, color: "var(--dsw-alias-label-caption, #888)" },
			searchInput: { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-label-primary, #111)", opacity: 0, pointerEvents: "none", transition: "opacity 120ms var(--ds-ease-in-out, ease)" },
			searchInputOn: { opacity: 1, pointerEvents: "auto" },
			clearBtn: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: "none", borderRadius: "50%", padding: 0, background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary, #666)" },
			// 在线文献检索入口 — 胶囊形输入行（参考 workspace .search 胶囊），
			// 背景透明继承 dsh 面板，深浅色主题自动跟随。
			// right-column literature search — precise filter form on top of the
			// results seat (opened by the 研究区 header toolbar button)
			litForm: { margin: "0 0 10px", padding: "10px 12px", boxSizing: "border-box", borderRadius: 12, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", background: "var(--dsw-alias-bg-layer-1, #fff)" },
			litRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 },
			litCheck: { display: "inline-flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", cursor: "pointer", whiteSpace: "nowrap" },
			finput: { flex: 1, minWidth: 0, width: "100%", boxSizing: "border-box", height: 30, padding: "5px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, outline: "none", background: "var(--dsw-alias-bg-layer-1, #fff)", fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-label-primary, #111)" },
			// icon button (workspace .iconButton 28x28)
			iconBtn: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "none", borderRadius: "50%", padding: 0, background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary, #666)" },
			// trailing header actions collapse when search expands (workspace .headerActions)
			headerActions: { flex: "none", display: "flex", alignItems: "center", gap: 4, maxWidth: 100, opacity: 1, overflow: "hidden", transition: "max-width 180ms var(--ds-ease-in-out, ease), opacity 120ms var(--ds-ease-in-out, ease), transform 180ms var(--ds-ease-in-out, ease)" },
			headerActionsHidden: { maxWidth: 0, opacity: 0, transform: "translateX(4px)", pointerEvents: "none" },
			// session row (workspace .sessionRow 32px; title 13px/20px)
			row: { display: "flex", alignItems: "center", height: 32, boxSizing: "border-box", borderRadius: 8, cursor: "pointer", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: "20px" },
			rowOn: { display: "flex", alignItems: "center", height: 32, boxSizing: "border-box", borderRadius: 8, cursor: "pointer", background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-primary, #111)", fontSize: 13, lineHeight: "20px" },
			rowTitle: { flex: 1, minWidth: 0, margin: "0 6px 0 4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 13, lineHeight: "20px" },
			rowSub: { flex: "none", fontSize: 12, lineHeight: "17px", color: "var(--dsw-alias-label-tertiary, #999)" },
			checkbox: { flex: "none", width: 16, height: 16, margin: 0, cursor: "pointer", accentColor: "var(--dsw-alias-button-primary-fill, #2563eb)" },
			// empty / status text (workspace .empty / .searchStatus)
			empty: { padding: "10px 12px", fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #999)" },
			err: { padding: "6px 12px", fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-error-primary, #dc2626)" },
			// detail panel (right-column paper detail preview)
			detail: { padding: "0", boxSizing: "border-box" },
			// right-column detail pane (conversation.details.research seat)
			detailPane: { height: "100%", minHeight: 0, overflowY: "auto", padding: "12px 20px 20px", boxSizing: "border-box" },
			// Right-column research seat: renders inside dsh DetailsPanel.body
			// (which already pads 12/16 and scrolls), so the seat adds no
			// padding / height / scroll of its own.
			rsRoot: { minWidth: 0, boxSizing: "border-box" },
			rsHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 2 },
			rsTitle: { fontSize: 14, lineHeight: "20px", fontWeight: 500, margin: 0, color: "var(--dsw-alias-label-primary, #111)" },
			rsMeta: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #999)", margin: "0 0 4px" },
			rsCardTitle: { fontSize: 14, lineHeight: "20px", fontWeight: 500, margin: 0, color: "var(--dsw-alias-label-primary, #111)" },
			detailTitle: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: "0 0 2px", color: "var(--dsw-alias-label-primary, #111)" },
			detailMeta: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #999)", margin: "0 0 3px" },
			tag: { display: "inline-block", fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))", color: "var(--dsw-alias-label-secondary, #666)", margin: "0 3px 2px 0" },
			fieldLabel: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 1, display: "block" },
			text: { fontSize: 13, lineHeight: 1.5, color: "var(--dsw-alias-label-primary, #111)", margin: "0 0 2px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
			// inputs / buttons
			input: { boxSizing: "border-box", width: "100%", height: 36, padding: "7px 14px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 18, outline: "none", background: "transparent", fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-label-primary, #111)" },
			textarea: { boxSizing: "border-box", width: "100%", minHeight: 80, padding: "7px 14px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 14, outline: "none", background: "transparent", fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-label-primary, #111)", resize: "vertical" },
			btn: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			btnPrimary: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-primary-fill, #2563eb)", color: "var(--dsw-alias-label-primary-foreground, #fff)", cursor: "pointer" },
			select: { padding: "5px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "transparent", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			field: { marginBottom: 6 },
			// bottom action bar
			bar: { flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "6px " + INSET, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", boxSizing: "border-box" },
			barLabel: { flex: 1, minWidth: 0, fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
			// view-settings dropdown + folder popover (anchored under the header)
			menu: { position: "absolute", top: 34, right: 4, zIndex: 30, minWidth: 148, padding: 4, borderRadius: 10, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", background: "var(--dsw-alias-bg-layer-2, #fff)", boxShadow: "0 8px 24px rgba(0,0,0,.12)" },
			menuItem: { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", fontSize: 13, color: "var(--dsw-alias-label-primary, #111)", cursor: "pointer", textAlign: "left" },
			popover: { position: "absolute", top: 34, right: 4, zIndex: 30, width: 220, padding: 10, borderRadius: 10, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", background: "var(--dsw-alias-bg-layer-2, #fff)", boxShadow: "0 8px 24px rgba(0,0,0,.12)" },
			statusDot: { flex: "none", width: 8, height: 8, borderRadius: "50%" },
			// modal dialog (hand-rolled mirror of primitives Modal)
			modalTitle: { fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: "var(--dsw-alias-label-primary, #111)" },
			modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 },
			ok: { padding: "6px 12px", fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-success-primary, #16a34a)" },
		};

		// Shared right-column research selection: the region writes it on a
		// paper click, the `conversation.details.research` seat reads it (both
		// registers live in this package, so a module-level signal is safe).
		var researchDetail = { paperId: null };
		var researchSubs = [];
		function setResearchDetail(id) {
			researchDetail.paperId = id;
			for (var i = 0; i < researchSubs.length; i++) researchSubs[i](id);
		}
		function subscribeResearchDetail(fn) {
			researchSubs.push(fn);
			return function () {
				researchSubs = researchSubs.filter(function (x) { return x !== fn; });
			};
		}

		// Shared right-column literature search: the 文献检索 action publishes a
		// result set here; the details seat renders it when no paper is focused.
		var researchSearch = { state: null }; // { query, results, loading } | null
		var researchSearchSubs = [];
		function setResearchSearch(state) {
			researchSearch.state = state;
			for (var i = 0; i < researchSearchSubs.length; i++) researchSearchSubs[i](state);
		}
		function subscribeResearchSearch(fn) {
			researchSearchSubs.push(fn);
			return function () {
				researchSearchSubs = researchSearchSubs.filter(function (x) { return x !== fn; });
			};
		}

		// External-result import request: the results pane publishes the clicked
		// paper here; the library view opens the import dialog for it.
		var researchImport = { paper: null };
		var researchImportSubs = [];
		function setResearchImport(paper) {
			researchImport.paper = paper;
			for (var i = 0; i < researchImportSubs.length; i++) researchImportSubs[i](paper);
		}
		function subscribeResearchImport(fn) {
			researchImportSubs.push(fn);
			return function () {
				researchImportSubs = researchImportSubs.filter(function (x) { return x !== fn; });
			};
		}

		// External-result PDF preview request: clicking a result that carries a
		// pdf_url opens a dsh-native PDF preview in the seat (iframe embed; the
		// toolbar falls back to a new-tab link for frame-blocking hosts).
		var researchPreview = { paper: null };
		var researchPreviewSubs = [];
		function setResearchPreview(paper) {
			researchPreview.paper = paper;
			for (var i = 0; i < researchPreviewSubs.length; i++) researchPreviewSubs[i](paper);
		}
		function subscribeResearchPreview(fn) {
			researchPreviewSubs.push(fn);
			return function () {
				researchPreviewSubs = researchPreviewSubs.filter(function (x) { return x !== fn; });
			};
		}

		// Paper Intelligence Card detail (preview + card + author info).
		// cardData = card (from /card endpoint) or detail.summary (from detail endpoint);
		// both return parseSummary(paper.summary) — identical data, but the detail
		// endpoint may complete faster so we cover both.
		function PaperDetail(props) {
			var detail = props.detail, card = props.card;
			var cardData = card || detail.summary;
			var fields = [["Abstract", cardData ? cardData.abstract : ""], ["Method", cardData ? cardData.method : ""], ["Finding", cardData ? cardData.finding : ""], ["Limitation", cardData ? cardData.limitation : ""], ["Future work", cardData ? cardData.future_work : ""]];
			return React.createElement("div", { style: S.detail },
				React.createElement("p", { style: S.detailTitle }, detail.title || "(untitled)"),
				React.createElement("p", { style: S.detailMeta }, (detail.authors || "—") + (detail.year ? " · " + detail.year : "") + (detail.doi ? " · DOI: " + detail.doi : "")),
				cardData && Array.isArray(cardData.tags) && cardData.tags.length ? React.createElement("div", { style: { marginBottom: 4 } },
					cardData.tags.map(function (t, i) { return React.createElement("span", { key: i, style: S.tag }, (t.name || "") + (t.category ? " · " + t.category : "")); }),
				) : null,
				fields.map(function (f, i) {
					if (!f[1]) return null;
					return React.createElement("div", { key: i, style: S.field },
						React.createElement("span", { style: S.fieldLabel }, f[0]),
						React.createElement("p", { style: S.text }, String(f[1])),
					);
				}),
				cardData ? null : React.createElement("p", { style: S.empty }, "（暂无 Paper Intelligence Card，可重新分析生成）"),
			);
		}

		// Source id -> display label (research-external-search provider names).
		var SOURCE_LABELS = { pubmed: "PubMed", europepmc: "Europe PMC", crossref: "Crossref", openalex: "OpenAlex", "semantic-scholar": "Semantic Scholar", arxiv: "arXiv", biorxiv: "bioRxiv" };
		function sourceLabel(s) { return SOURCE_LABELS[s] || s || ""; }
		function authorsText(a) {
			if (!Array.isArray(a) || a.length === 0) return "";
			var names = a.slice(0, 3).join(", ");
			return a.length > 3 ? names + " et al." : names;
		}

		// Same-origin PDF proxy link + download filename for external results
		// (shared by the search drawer and the right-seat preview panel).
		function proxyPdfUrl(p) { return "/research-external-search/pdf?url=" + encodeURIComponent(p.pdf_url); }
		function pdfDownloadLabel(p) { return ((p.title || "paper").slice(0, 60)) + ".pdf"; }

		// dsh-native PDF preview. Local storage keys (papers/... ) are served
		// through /research-file/files/{key}; external URLs go through the
		// same-origin proxy /research-external-search/pdf?url= (upstream hosts
		// like Wiley/EuropePMC refuse direct iframe embedding via
		// X-Frame-Options, so the server fetches and re-serves the PDF as
		// application/pdf for the browser's built-in PDF viewer).
		function PdfPreview(props) {
			var src = props.src || "";
			var title = props.title || "(PDF)";
			var isExternal = /^https?:\/\//i.test(src);
			var iframeSrc = isExternal
				? ("/research-external-search/pdf?url=" + encodeURIComponent(src))
				: ("/research-file/files/" + encodeURIComponent(src).replace(/%2F/g, "/"));
			return React.createElement("div", null,
				React.createElement("iframe", { src: iframeSrc, title: title, style: { width: "100%", height: 420, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 12, background: "var(--dsw-alias-bg-layer-1, #fff)", boxSizing: "border-box" } }),
			);
		}

		// Detail view tab strip: [PDF 预览] [Paper Card]. Mirrors the dsh
		// DetailsPanel tab look (13px labels, accent underline on the active).
		function TabBar(props) {
			var tabs = props.tabs || [];
			var active = props.active;
			var onSelect = props.onSelect;
			return React.createElement("div", { className: "dsh-rr-tabs" }, tabs.map(function (t) {
				return React.createElement("button", {
					type: "button",
					key: t.key,
					className: "dsh-rr-tab" + (t.key === active ? " dsh-rr-tab-on" : ""),
					onClick: function () { if (onSelect) onSelect(t.key); },
				}, t.label);
			}));
		}

		// External-result card content (preview seat, Card tab): renders the
		// same fields the local PaperDetail shows, but from the wire shape of
		// research-external-search results (no detail/card endpoints involved).
		function ExternalPaperCard(props) {
			var p = props.paper || {};
			var authors = authorsText(p.authors);
			var rows = [
				["来源", sourceLabel(p.source) || "—"],
				["作者", authors || "—"],
				["年份", p.year ? String(p.year) : "—"],
				["DOI", p.doi || "—"],
				["PMID", p.pmid || "—"],
				["期刊/会议", p.venue || "—"],
				["开放获取", p.open_access ? "是" : "否"],
			];
			return React.createElement("div", null,
				React.createElement("p", { style: S.detailTitle }, p.title || "(untitled)"),
				React.createElement("p", { style: S.detailMeta }, (sourceLabel(p.source) ? sourceLabel(p.source) + " · " : "") + (p.year ? p.year + " · " : "") + (p.doi ? "DOI: " + p.doi : "")),
				rows.map(function (r, i) {
					return React.createElement("div", { key: i, style: S.field },
						React.createElement("span", { style: S.fieldLabel }, r[0]),
						React.createElement("p", { style: S.text }, r[1]),
					);
				}),
				p.abstract ? React.createElement("div", { style: S.field },
					React.createElement("span", { style: S.fieldLabel }, "Abstract"),
					React.createElement("p", { style: S.text }, p.abstract),
				) : null,
			);
		}

		// Right-column literature search (conversation.details.research):
		// the 研究区 header toolbar button opens this seat. A precise filter
		// form sits on top (keyword / title / author / DOI / year range /
		// open-access); results render below as block cards aligned to the dsh
		// DetailsPanel. Clicking a card publishes an import request.
		function SearchResultsPanel(props) {
			var s = props.search;
			// Form state — initialized once from the search filters (回显), then
			// kept by React across result refreshes (same component instance).
			var [fQ, setFQ] = useState(s.q || "");
			var [fTitle, setFTitle] = useState(s.title || "");
			var [fAuthor, setFAuthor] = useState(s.author || "");
			var [fDoi, setFDoi] = useState(s.doi || "");
			var [fYearFrom, setFYearFrom] = useState(s.year_from ? String(s.year_from) : "");
			var [fYearTo, setFYearTo] = useState(s.year_to ? String(s.year_to) : "");
			var [fOpen, setFOpen] = useState(!!s.open_access);
			var doSearch = function () {
				var params = [];
				if (fQ.trim()) params.push("q=" + encodeURIComponent(fQ.trim()));
				if (fTitle.trim()) params.push("title=" + encodeURIComponent(fTitle.trim()));
				if (fAuthor.trim()) params.push("author=" + encodeURIComponent(fAuthor.trim()));
				if (fDoi.trim()) params.push("doi=" + encodeURIComponent(fDoi.trim()));
				if (fYearFrom.trim()) params.push("year_from=" + encodeURIComponent(fYearFrom.trim()));
				if (fYearTo.trim()) params.push("year_to=" + encodeURIComponent(fYearTo.trim()));
				if (fOpen) params.push("open_access=1");
				if (params.length === 0) return;
				params.push("limit=20");
				var next = {
					q: fQ.trim(), title: fTitle.trim(), author: fAuthor.trim(), doi: fDoi.trim(),
					year_from: fYearFrom.trim(), year_to: fYearTo.trim(), open_access: fOpen,
					results: null, loading: true, error: null, form: false,
				};
				setResearchSearch(next);
				api("/research-external-search?" + params.join("&")).then(function (j) {
					if (ok(j)) {
						var r = (j.data && j.data.results) || [];
						setResearchSearch(Object.assign({}, next, { results: r, loading: false }));
					} else {
						setResearchSearch(Object.assign({}, next, { results: [], loading: false, error: j.message || "检索失败" }));
					}
				}).catch(function () {
					setResearchSearch(Object.assign({}, next, { results: [], loading: false, error: "网络错误，请重试" }));
				});
			};
			// Condition summary for the header meta line.
			var conds = [];
			if (s.title) conds.push("标题:" + s.title);
			if (s.author) conds.push("作者:" + s.author);
			if (s.doi) conds.push("DOI:" + s.doi);
			if (s.q) conds.push("关键词:" + s.q);
			if (s.year_from || s.year_to) conds.push((s.year_from || "") + "–" + (s.year_to || ""));
			if (s.open_access) conds.push("仅开放获取");
			var meta = conds.length ? conds.join(" · ") : (s.loading || s.results ? "检索条件" : "输入条件开始检索在线文献库");
			return React.createElement("div", { style: S.rsRoot },
				React.createElement("div", { style: S.rsHead },
					React.createElement("div", null,
						React.createElement("p", { style: S.rsTitle }, "在线文献检索"),
						React.createElement("p", { style: S.rsMeta }, meta + (s.loading ? " · 检索中…" : (s.results ? " · " + s.results.length + " 条结果" : ""))),
					),
					React.createElement("button", { type: "button", style: S.iconBtn, title: "关闭", onClick: function () { setResearchSearch(null); } }, React.createElement(IconClose, { size: 14 })),
				),
				React.createElement("div", { style: S.litForm },
					React.createElement("div", { style: S.litRow },
						React.createElement("input", { style: S.finput, type: "text", placeholder: "关键词（标题/摘要自由词）", maxLength: 200, value: fQ, onChange: function (e) { setFQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); } }),
					),
					React.createElement("div", { style: S.litRow },
						React.createElement("input", { style: S.finput, type: "text", placeholder: "标题（精确短语）", maxLength: 200, value: fTitle, onChange: function (e) { setFTitle(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); } }),
						React.createElement("input", { style: S.finput, type: "text", placeholder: "作者", maxLength: 120, value: fAuthor, onChange: function (e) { setFAuthor(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); } }),
					),
					React.createElement("div", { style: S.litRow },
						React.createElement("input", { style: S.finput, type: "text", placeholder: "DOI", maxLength: 120, value: fDoi, onChange: function (e) { setFDoi(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); } }),
						React.createElement("input", { style: S.finput, type: "number", placeholder: "起年", min: 1900, max: 2100, value: fYearFrom, onChange: function (e) { setFYearFrom(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); } }),
						React.createElement("input", { style: S.finput, type: "number", placeholder: "止年", min: 1900, max: 2100, value: fYearTo, onChange: function (e) { setFYearTo(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); } }),
					),
					React.createElement("div", { style: S.litRow },
						React.createElement("label", { style: S.litCheck }, React.createElement("input", { type: "checkbox", style: S.checkbox, checked: fOpen, onChange: function (e) { setFOpen(e.target.checked); } }), " 仅开放获取"),
						React.createElement("button", { type: "button", style: S.btnPrimary, onClick: doSearch }, "检索"),
					),
				),
				s.loading ? React.createElement("p", { style: S.empty }, "检索中…")
					: s.error ? React.createElement("p", { style: S.err }, s.error)
					: !s.results || s.results.length === 0 ? React.createElement("p", { style: S.empty }, "无匹配文献")
					: React.createElement("div", null, s.results.map(function (p, i) {
						var authors = authorsText(p.authors);
						return React.createElement("div", { key: p.source_id || p.doi || i, className: "dsh-rr-card", style: { cursor: "default" } },
							React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 8 } },
								React.createElement("div", { style: { flex: 1, minWidth: 0, cursor: "pointer" }, onClick: function () { setResearchPreview(p); } },
									React.createElement("p", { style: S.rsCardTitle }, p.title || "(untitled)"),
									React.createElement("div", { className: "dsh-rr-meta" },
										sourceLabel(p.source) ? React.createElement("span", { className: "dsh-rr-badge" }, sourceLabel(p.source)) : null,
										p.year ? React.createElement("span", null, p.year) : null,
										authors ? React.createElement("span", null, authors) : null,
										p.doi ? React.createElement("span", null, "DOI: " + p.doi) : null,
										p.venue ? React.createElement("span", null, p.venue) : null,
									),
								),
								React.createElement("button", { type: "button", style: S.btn, title: "导入到研究区", onClick: function () { setResearchImport(p); } }, "导入"),
							),
							p.abstract ? React.createElement("p", { className: "dsh-rr-abst" }, p.abstract) : null,
						);
					})),
			);
		}

		// Right-column seat (conversation.details.research): paper detail outranks
		// the search list; clicking a result focuses the paper. Both the local
		// paper detail and an external result preview show two tabs — PDF 预览
		// (iframe) and Paper Card (paper intelligence content).
		function ResearchDetailPanel(props) {
			var [paperId, setPaperId] = useState(researchDetail.paperId);
			var [search, setSearch] = useState(researchSearch.state);
			var [preview, setPreview] = useState(researchPreview.paper);
			var [detail, setDetail] = useState(null);
			var [card, setCard] = useState(null);
			var [tab, setTab] = useState("pdf");
			useEffect(function () { return subscribeResearchDetail(setPaperId); }, []);
			useEffect(function () { return subscribeResearchSearch(setSearch); }, []);
			useEffect(function () { return subscribeResearchPreview(setPreview); }, []);
			useEffect(function () {
				if (paperId == null) { setDetail(null); setCard(null); return; }
				setDetail(null); setCard(null);
				api("/research-paper/papers/" + paperId).then(function (j) { if (ok(j)) setDetail(j.data); });
				api("/research-paper/papers/" + paperId + "/card").then(function (j) { if (ok(j) && j.data) setCard(j.data); });
			}, [paperId]);
			if (paperId != null) {
				if (!detail) return React.createElement("div", { style: S.rsRoot }, React.createElement("p", { style: S.empty }, "加载论文详情…"));
				var pdfSrc = detail.pdfUrl || detail.pdf_url || null;
				return React.createElement("div", { style: S.rsRoot },
					React.createElement(TabBar, { tabs: [{ key: "pdf", label: "PDF 预览" }, { key: "card", label: "Paper Card" }], active: tab, onSelect: setTab }),
					tab === "card" ? React.createElement(PaperDetail, { detail: detail, card: card })
						: pdfSrc ? React.createElement(PdfPreview, { src: pdfSrc, title: detail.title || "(PDF)" })
						: React.createElement("p", { style: S.empty }, "该论文没有可预览的 PDF 文件"),
				);
			}
			if (preview) {
				var p = preview;
				return React.createElement("div", { style: S.rsRoot },
					React.createElement("div", { style: S.rsHead },
						React.createElement("div", null,
							React.createElement("p", { style: S.rsTitle }, p.title || "(untitled)"),
							React.createElement("p", { style: S.rsMeta }, sourceLabel(p.source) ? sourceLabel(p.source) + " · " : "" + (p.year ? p.year + " · " : "") + (p.doi ? "DOI: " + p.doi : "")),
						),
						React.createElement("button", { type: "button", style: S.iconBtn, title: "关闭", onClick: function () { setResearchPreview(null); } }, React.createElement(IconClose, { size: 14 })),
					),
					React.createElement(TabBar, { tabs: [{ key: "pdf", label: "PDF 预览" }, { key: "card", label: "Paper Card" }], active: tab, onSelect: setTab }),
					tab === "card" ? React.createElement(ExternalPaperCard, { paper: p })
						: p.pdf_url ? React.createElement(PdfPreview, { src: p.pdf_url, title: p.title || "(PDF)" })
						: React.createElement("p", { style: S.empty }, "该文献没有可预览的 PDF 文件"),
					React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" } },
						p.url ? React.createElement("a", { key: "src", href: p.url, target: "_blank", rel: "noopener", style: Object.assign({}, S.btn, { textDecoration: "none", display: "inline-block" }) }, "打开原文 ↗") : null,
						p.pdf_url ? React.createElement("a", { key: "dl", href: proxyPdfUrl(p), download: pdfDownloadLabel(p), style: Object.assign({}, S.btn, { textDecoration: "none", display: "inline-block" }) }, "下载 PDF") : null,
						React.createElement("button", { key: "imp", type: "button", style: S.btnPrimary, onClick: function () { setResearchImport(p); } }, "导入到研究区"),
						React.createElement("button", { key: "back", type: "button", style: S.btn, onClick: function () { setResearchPreview(null); } }, "返回结果列表"),
					),
				);
			}
			if (search) return React.createElement(SearchResultsPanel, { search: search });
			return null; // empty seat
		}

		// ── time / status helpers ─────────────────────────────────────
		function timeLabel(iso, now) {
			if (!iso) return "";
			var t = new Date(iso).getTime();
			if (!t) return "";
			var diff = now - t;
			if (diff < 60000) return "刚刚";
			if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
			if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
			if (diff < 604800000) return Math.floor(diff / 86400000) + "天前";
			var d = new Date(t);
			return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
		}
		function dotColor(st) {
			if (st === "READY") return "var(--dsw-alias-state-success-primary, #16a34a)";
			if (st === "PROCESSING") return "var(--dsw-alias-button-primary-fill, #2563eb)";
			if (st === "FAILED") return "var(--dsw-alias-state-error-primary, #dc2626)";
			return "var(--dsw-alias-label-tertiary, #9ca3af)";
		}
		function flattenFolders(tree, depth, out) {
			(tree || []).forEach(function (f) {
				out.push({ id: f.id, name: f.name, depth: depth });
				if (f.children && f.children.length) flattenFolders(f.children, depth + 1, out);
			});
			return out;
		}

		// ── fixed dropdown (mirrors primitives Menu; portal-free) ──────
		function Dropdown(props) {
			var onCloseRef = useRef(props.onClose);
			useEffect(function () { onCloseRef.current = props.onClose; });
			useEffect(function () {
				function docClick() { onCloseRef.current && onCloseRef.current(); }
				function key(ev) { if (ev.key === "Escape") onCloseRef.current && onCloseRef.current(); }
				var t = setTimeout(function () {
					document.addEventListener("click", docClick);
					document.addEventListener("keydown", key);
				}, 0);
				return function () { clearTimeout(t); document.removeEventListener("click", docClick); document.removeEventListener("keydown", key); };
			}, []);
			return React.createElement("div", { className: "dsh-rr-menu", style: { left: props.x, top: props.y }, onClick: function (e) { e.stopPropagation(); } },
				props.items.map(function (it, i) {
					if (it.type === "label") return React.createElement("div", { key: i, className: "dsh-rr-menu-label" }, it.label);
					if (it.type === "separator") return React.createElement("div", { key: i, className: "dsh-rr-menu-sep" });
					return React.createElement("button", { key: i, type: "button", className: "dsh-rr-menu-item" + (it.danger ? " dsh-rr-danger" : ""), onClick: function () { props.onSelect(it.id); } },
						it.icon ? React.createElement("span", { className: "dsh-rr-menu-ic" }, React.createElement(it.icon, { size: 16 })) : React.createElement("span", { className: "dsh-rr-menu-ic" }),
						React.createElement("span", { style: { flex: 1 } }, it.label),
						it.selected ? React.createElement("span", { className: "dsh-rr-menu-ic" }, React.createElement(IconCheck, { size: 16 })) : null,
					);
				}),
			);
		}

		// ── modal (mirrors primitives Modal; portal-free) ──────────────
		function Modal(props) {
			return React.createElement("div", { className: "dsh-rr-overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
				React.createElement("div", { className: "dsh-rr-modal" },
					React.createElement("p", { style: S.modalTitle }, props.title),
					props.children,
					React.createElement("div", { style: S.modalFooter }, props.footer),
				),
			);
		}

		// ── dialog form (one modal drives all file-management mutations) ──
		function DialogForm(props) {
			var dialog = props.dialog;
			var [text, setText] = useState("");
			var [text2, setText2] = useState("");
			var [targetFolder, setTargetFolder] = useState("root");
			var [importProjectId, setImportProjectId] = useState("");
			var [busy, setBusy] = useState(false);
			var [msg, setMsg] = useState(null);
			useEffect(function () {
				setText(dialog && dialog.initial ? dialog.initial : "");
				setText2("");
				setTargetFolder("root");
				setImportProjectId("");
				setBusy(false); setMsg(null);
			}, [dialog]);
			var kind = dialog ? dialog.kind : null;
			var title = kind === "newProject" ? "新建项目"
				: kind === "newFolder" ? "新建文件夹"
				: kind === "import" ? "导入论文"
				: kind === "importExternal" ? "导入外部论文"
				: kind === "renameProject" ? "重命名项目"
				: kind === "renameFolder" ? "重命名文件夹"
				: kind === "deleteProject" ? "删除项目"
				: kind === "deleteFolder" ? "删除文件夹"
				: kind === "deletePaper" ? "删除论文"
				: kind === "movePaper" ? "移动论文" : "";
			var confirmOnly = kind === "deleteProject" || kind === "deleteFolder" || kind === "deletePaper";

			function submit() {
				if (busy) return;
				var d = dialog;
				setMsg(null);
				var req = null;
				if (kind === "newProject") {
					if (!text.trim()) { setMsg("请输入项目名称"); return; }
					req = { method: "POST", url: "/research-project", body: { name: text.trim(), description: text2.trim() || null } };
				} else if (kind === "newFolder") {
					if (!text.trim()) { setMsg("请输入文件夹名称"); return; }
					req = { method: "POST", url: "/research-folder/folders", body: { projectId: d.projectId, name: text.trim() } };
				} else if (kind === "import") {
					if (!text.trim()) { setMsg("请输入 DOI 或标题"); return; }
					req = { method: "POST", url: "/research-paper/projects/" + d.projectId + "/papers/import", body: { doi: text.trim(), title: text.trim(), folderId: d.folderId == null ? null : d.folderId } };
				} else if (kind === "importExternal") {
					var pid = Number(importProjectId);
					if (!pid) { setMsg("请选择导入到哪个项目"); return; }
					var ext = d.paper || {};
					req = { method: "POST", url: "/research-paper/projects/" + pid + "/papers/import", body: { doi: ext.doi || "", title: ext.title || "", authors: ext.authors || [], year: ext.year || null } };
				} else if (kind === "renameProject") {
					if (!text.trim()) { setMsg("请输入项目名称"); return; }
					req = { method: "PUT", url: "/research-project/" + d.project.id + "/rename", body: { name: text.trim() } };
				} else if (kind === "renameFolder") {
					if (!text.trim()) { setMsg("请输入文件夹名称"); return; }
					req = { method: "PUT", url: "/research-folder/folders/" + d.folder.id + "/rename", body: { name: text.trim() } };
				} else if (kind === "deleteProject") {
					req = { method: "DELETE", url: "/research-project/" + d.project.id };
				} else if (kind === "deleteFolder") {
					req = { method: "DELETE", url: "/research-folder/folders/" + d.folder.id };
				} else if (kind === "deletePaper") {
					req = { method: "DELETE", url: "/research-paper/papers/" + d.paper.id };
				} else if (kind === "movePaper") {
					req = { method: "PUT", url: "/research-paper/papers/" + d.paper.id + "/move", body: { folderId: targetFolder === "root" ? null : Number(targetFolder) } };
				}
				if (!req) return;
				setBusy(true);
				var opts = { method: req.method, credentials: "include" };
				if (req.body) { opts.headers = { "content-type": "application/json" }; opts.body = JSON.stringify(req.body); }
				api(req.url, opts).then(function (j) {
					if (ok(j)) props.onDone && props.onDone(kind, dialog);
					else { setMsg(j.message || "操作失败"); setBusy(false); }
				}).catch(function () { setMsg("网络错误"); setBusy(false); });
			}

			function body() {
				if (confirmOnly) {
					var what = kind === "deleteProject" ? "项目「" + (dialog.project && dialog.project.name) + "」"
						: kind === "deleteFolder" ? "文件夹「" + (dialog.folder && dialog.folder.name) + "」"
						: "论文「" + (dialog.paper && dialog.paper.title) + "」";
					return React.createElement("p", { style: S.text }, "确定删除 " + what + " 吗？此操作不可撤销。");
				}
				if (kind === "movePaper") {
					return React.createElement("select", { style: Object.assign({}, S.select, { width: "100%", height: 36 }), value: targetFolder, onChange: function (e) { setTargetFolder(e.target.value); } },
						React.createElement("option", { value: "root" }, "根目录（无文件夹）"),
						(dialog.folderOptions || []).map(function (f) { return React.createElement("option", { key: f.id, value: String(f.id) }, new Array(f.depth + 1).join("　") + f.name); }),
					);
				}
				if (kind === "importExternal") {
					var ext = dialog.paper || {};
					return React.createElement("div", null,
						React.createElement("p", { style: S.text }, ext.title || "(untitled)"),
						React.createElement("p", { style: S.detailMeta }, (Array.isArray(ext.authors) && ext.authors.length ? ext.authors.join(", ") : "—") + (ext.year ? " · " + ext.year : "") + (ext.doi ? " · DOI: " + ext.doi : "") + (ext.source ? " · " + ext.source : "")),
						React.createElement("div", { style: { height: 8 } }),
						React.createElement("select", { style: Object.assign({}, S.select, { width: "100%", height: 36 }), value: importProjectId, onChange: function (e) { setImportProjectId(e.target.value); } },
							React.createElement("option", { value: "" }, "选择项目…"),
							(props.projects || []).map(function (p2) { return React.createElement("option", { key: p2.id, value: String(p2.id) }, p2.name || ("#" + p2.id)); }),
						),
					);
				}
				return React.createElement("div", null,
					React.createElement("input", { style: S.input, autoFocus: true, placeholder: kind === "import" ? "DOI 或标题" : "名称", value: text, onChange: function (e) { setText(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submit(); } }),
					kind === "newProject" ? React.createElement("input", { style: Object.assign({}, S.input, { marginTop: 8 }), placeholder: "描述（可选）", value: text2, onChange: function (e) { setText2(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submit(); } }) : null,
				);
			}

			return React.createElement(Modal, {
				title: title,
				onClose: function () { if (!busy) props.onClose(); },
				footer: [
					React.createElement("button", { key: "cancel", type: "button", style: S.btn, disabled: busy, onClick: function () { if (!busy) props.onClose(); } }, "取消"),
					React.createElement("button", { key: "ok", type: "button", style: S.btnPrimary, disabled: busy, onClick: submit }, busy ? "处理中…" : (confirmOnly ? "删除" : "确定")),
				],
			}, [
				body(),
				msg ? React.createElement("p", { style: Object.assign({}, S.err, { padding: 0, marginTop: 8 }) }, msg) : null,
			]);
		}

		// ── 文献库（研究区唯一功能页；文件管理与工作区一致）────────────────
		function LibraryView(props) {
			var sel = props.sel, toggleSel = props.toggleSel, focus = props.focus, focused = props.focused, removeSel = props.removeSel;
			var searchRef = useRef(null);
			var [q, setQ] = useState("");        // header search: tree filter
			var [searchOpen, setSearchOpen] = useState(false);
			var [searchResults, setSearchResults] = useState(null);
			var [showStatus, setShowStatus] = useState(false);
			var [onlyReady, setOnlyReady] = useState(false);
			var [groupBy, setGroupBy] = useState("project"); // 'project' | 'flat'
			var [orderBy, setOrderBy] = useState("recent"); // 'recent' | 'oldest'
			var [projects, setProjects] = useState(null);
			var [foldersByProject, setFoldersByProject] = useState({});
			var [papersByProject, setPapersByProject] = useState({});
			var [expandedProjects, setExpandedProjects] = useState({});
			var [expandedFolders, setExpandedFolders] = useState({});
			var [unauth, setUnauth] = useState(false);
			var [err, setErr] = useState(null);
			var [menu, setMenu] = useState(null);
			var [dialog, setDialog] = useState(null);

			// Load the tree: projects -> folders (nested) -> papers (all, tagged projectId).
			var loadTree = useCallback(function () {
				setErr(null); setUnauth(false);
				api("/research-project?page=0&size=100").then(function (j) {
					if (j && j.code === 401) { setUnauth(true); setProjects([]); return; }
					if (!ok(j)) { setErr(j.message || "加载失败"); setProjects([]); return; }
					var projs = j.data.items || [];
					setProjects(projs);
					var exp = {};
					projs.forEach(function (p) { exp[p.id] = true; });
					setExpandedProjects(exp);
					Promise.all(projs.map(function (p) {
						return Promise.all([
							api("/research-folder/projects/" + p.id + "/folders/tree"),
							api("/research-paper/projects/" + p.id + "/papers?folderId=-1&size=200"),
						]).then(function (rs) {
							var folders = (ok(rs[0]) && rs[0].data) ? rs[0].data : [];
							var papers = (ok(rs[1]) && rs[1].data && rs[1].data.items) ? rs[1].data.items : [];
							papers.forEach(function (it) { it.projectId = p.id; });
							return { id: p.id, folders: folders, papers: papers };
						});
					})).then(function (results) {
						var fbp = {}, pbp = {}, allPapers = [];
						results.forEach(function (r) { fbp[r.id] = r.folders; pbp[r.id] = r.papers; allPapers = allPapers.concat(r.papers); });
						setFoldersByProject(fbp); setPapersByProject(pbp);
						if (props.onPapers) props.onPapers(allPapers);
					}).catch(function () { setErr("网络错误"); });
				}).catch(function () { setErr("网络错误"); });
			}, [props.onPapers]);
			useEffect(function () { loadTree(); }, [loadTree]);
			// External result click -> open the import dialog.
			useEffect(function () {
				return subscribeResearchImport(function (paper) {
					if (paper) setDialog({ kind: "importExternal", paper: paper });
				});
			}, []);

			// Header search: live-debounced filter of the tree (title/author/DOI).
			useEffect(function () {
				if (!q.trim()) { setSearchResults(null); return; }
				var t = setTimeout(function () {
					api("/research-paper/search?q=" + encodeURIComponent(q.trim()) + "&limit=50").then(function (j) {
						if (ok(j)) setSearchResults(j.data.items || []);
						else setSearchResults([]);
					});
				}, 250);
				return function () { clearTimeout(t); };
			}, [q]);

			// ── menu / dialog openers ─────────────────────────────────────
			function openMenuAt(e, target, items) {
				var r = e.currentTarget.getBoundingClientRect();
				setMenu({ x: Math.max(8, r.right - 152), y: r.bottom + 4, target: target, items: items });
			}
			function openViewMenu(e) {
				openMenuAt(e, { kind: "view" }, [
					{ type: "label", label: "分组方式" },
					{ id: "project", label: "按项目", selected: groupBy === "project" },
					{ id: "flat", label: "平铺列表", selected: groupBy === "flat" },
					{ type: "separator" },
					{ type: "label", label: "排序方式" },
					{ id: "recent", label: "最近更新", selected: orderBy === "recent" },
					{ id: "oldest", label: "最早创建", selected: orderBy === "oldest" },
					{ type: "separator" },
					{ id: "showStatus", label: "显示状态", selected: showStatus },
					{ id: "onlyReady", label: "仅显示已就绪", selected: onlyReady },
				]);
			}
			function openProjectMenu(e, p) {
				openMenuAt(e, { kind: "project", project: p }, [
					{ id: "rename", label: "重命名", icon: IconEdit },
					{ id: "delete", label: "删除项目", icon: IconTrash, danger: true },
				]);
			}
			function openFolderMenu(e, f, projectId) {
				openMenuAt(e, { kind: "folder", folder: f, projectId: projectId }, [
					{ id: "rename", label: "重命名", icon: IconEdit },
					{ id: "delete", label: "删除文件夹", icon: IconTrash, danger: true },
				]);
			}
			function openPaperMenu(e, p) {
				var items = [{ id: "delete", label: "删除", icon: IconTrash, danger: true }];
				if (p.projectId != null) items.unshift({ id: "move", label: "移动到…", icon: IconFolderClose });
				openMenuAt(e, { kind: "paper", paper: p }, items);
			}
			function handleMenuSelect(target, id) {
				if (!target) return;
				if (target.kind === "view") {
					if (id === "project") setGroupBy("project");
					else if (id === "flat") setGroupBy("flat");
					else if (id === "recent") setOrderBy("recent");
					else if (id === "oldest") setOrderBy("oldest");
					else if (id === "showStatus") setShowStatus(!showStatus);
					else if (id === "onlyReady") setOnlyReady(!onlyReady);
					return;
				}
				if (target.kind === "project") {
					if (id === "rename") setDialog({ kind: "renameProject", project: target.project, initial: target.project.name });
					else if (id === "delete") setDialog({ kind: "deleteProject", project: target.project });
				} else if (target.kind === "folder") {
					if (id === "rename") setDialog({ kind: "renameFolder", folder: target.folder, initial: target.folder.name });
					else if (id === "delete") setDialog({ kind: "deleteFolder", folder: target.folder });
				} else if (target.kind === "paper") {
					if (id === "move") setDialog({ kind: "movePaper", paper: target.paper, folderOptions: flattenFolders(foldersByProject[target.paper.projectId] || [], 0, []) });
					else if (id === "delete") setDialog({ kind: "deletePaper", paper: target.paper });
				}
			}

			var toggleProject = function (id) { setExpandedProjects(function (s) { var n = Object.assign({}, s); n[id] = !n[id]; return n; }); };
			var toggleFolder = function (id) { setExpandedFolders(function (s) { var n = Object.assign({}, s); n[id] = !n[id]; return n; }); };
			var now = Date.now();
			var paperCmp = orderBy === "oldest"
				? function (a, b) { return new Date(a.createdTime || 0) - new Date(b.createdTime || 0); }
				: function (a, b) { return new Date(b.createdTime || 0) - new Date(a.createdTime || 0); };

			function paperRow(p, depth) {
				var on = focused === p.id;
				if (onlyReady && p.status !== "READY") return null;
				return React.createElement("div", { key: "p-" + p.id, className: "dsh-rr-prow" + (on ? " dsh-rr-on" : ""), style: { paddingLeft: (8 + depth * 22) + "px" }, onClick: function () { focus(p.id); if (props.openDetails) props.openDetails(); } },
					React.createElement("input", { type: "checkbox", style: S.checkbox, checked: !!sel[p.id], onClick: function (e) { e.stopPropagation(); }, onChange: function () { toggleSel(p.id); } }),
					showStatus ? React.createElement("span", { className: "dsh-rr-slot" }, React.createElement("span", { style: Object.assign({}, S.statusDot, { background: dotColor(p.status) }), title: p.status || "" })) : null,
					React.createElement("span", { className: "dsh-rr-ptitle" }, p.title || "(untitled)"),
					React.createElement("span", { className: "dsh-rr-time" }, timeLabel(p.createdTime, now)),
					React.createElement("span", { className: "dsh-rr-actions" },
						React.createElement("button", { type: "button", className: "dsh-rr-iconbtn", title: "更多", onClick: function (e) { e.stopPropagation(); openPaperMenu(e, p); } }, React.createElement(IconEllipsis, null)),
					),
				);
			}
			function folderRow(f, depth, projectId) {
				var expanded = !!expandedFolders[f.id];
				var papers = (papersByProject[projectId] || []).filter(function (pp) { return pp.folderId === f.id; }).sort(paperCmp);
				return React.createElement("div", { key: "f-" + f.id },
					React.createElement("div", { className: "dsh-rr-frow", style: { paddingLeft: (8 + depth * 22) + "px" }, onClick: function () { toggleFolder(f.id); } },
						React.createElement("span", { className: "dsh-rr-slot dsh-rr-ficon" }, expanded ? React.createElement(IconFolderOpen, null) : React.createElement(IconFolderClose, null)),
						React.createElement("span", { className: "dsh-rr-slot dsh-rr-chevron" }, React.createElement(IconChevronRight, { className: "dsh-rr-arrow" + (expanded ? " dsh-rr-open" : "") })),
						React.createElement("span", { className: "dsh-rr-ftitle" }, f.name),
						React.createElement("span", { className: "dsh-rr-actions" },
							React.createElement("button", { type: "button", className: "dsh-rr-iconbtn", title: "更多", onClick: function (e) { e.stopPropagation(); openFolderMenu(e, f, projectId); } }, React.createElement(IconEllipsis, null)),
							React.createElement("button", { type: "button", className: "dsh-rr-iconbtn", title: "导入论文", onClick: function (e) { e.stopPropagation(); setDialog({ kind: "import", projectId: projectId, folderId: f.id }); } }, React.createElement(IconPlus, null)),
						),
					),
					expanded ? React.createElement("div", null,
						(f.children || []).map(function (c) { return folderRow(c, depth + 1, projectId); }),
						papers.map(function (p) { return paperRow(p, depth + 1); }),
					) : null,
				);
			}
			function projectRow(p) {
				var expanded = !!expandedProjects[p.id];
				var folders = foldersByProject[p.id] || [];
				var rootPapers = (papersByProject[p.id] || []).filter(function (pp) { return pp.folderId == null; }).sort(paperCmp);
				return React.createElement("div", { key: "proj-" + p.id },
					React.createElement("div", { className: "dsh-rr-frow", onClick: function () { toggleProject(p.id); } },
						React.createElement("span", { className: "dsh-rr-slot dsh-rr-ficon" }, expanded ? React.createElement(IconFolderOpen, null) : React.createElement(IconFolderClose, null)),
						React.createElement("span", { className: "dsh-rr-slot dsh-rr-chevron" }, React.createElement(IconChevronRight, { className: "dsh-rr-arrow" + (expanded ? " dsh-rr-open" : "") })),
						React.createElement("span", { className: "dsh-rr-ftitle" }, p.name || ("#" + p.id)),
						React.createElement("span", { className: "dsh-rr-actions" },
							React.createElement("button", { type: "button", className: "dsh-rr-iconbtn", title: "更多", onClick: function (e) { e.stopPropagation(); openProjectMenu(e, p); } }, React.createElement(IconEllipsis, null)),
							React.createElement("button", { type: "button", className: "dsh-rr-iconbtn", title: "新建文件夹", onClick: function (e) { e.stopPropagation(); setDialog({ kind: "newFolder", projectId: p.id }); } }, React.createElement(IconPlus, null)),
						),
					),
					expanded ? React.createElement("div", null,
						folders.map(function (f) { return folderRow(f, 1, p.id); }),
						rootPapers.map(function (pp) { return paperRow(pp, 1); }),
					) : null,
				);
			}

			var allPapers = [];
			Object.keys(papersByProject).forEach(function (pid) { allPapers = allPapers.concat(papersByProject[pid]); });
			allPapers.sort(paperCmp);

			function listBody() {
				if (unauth) return React.createElement("p", { style: S.empty }, "未登录 — 研究功能需要 ResearchOS 账号");
				if (err) return React.createElement("p", { style: S.err }, err);
				if (q.trim()) {
					if (searchResults == null) return React.createElement("p", { style: S.empty }, "检索中…");
					if (searchResults.length === 0) return React.createElement("p", { style: S.empty }, "无匹配文献");
					return React.createElement("div", null, searchResults.map(function (p) { return paperRow(p, 0); }));
				}
				if (projects == null) return React.createElement("p", { style: S.empty }, "加载中…");
				if (projects.length === 0) return React.createElement("p", { style: S.empty }, "暂无项目，点击右上角 ＋ 新建项目");
				if (groupBy === "flat") {
					if (allPapers.length === 0) return React.createElement("p", { style: S.empty }, "暂无文献");
					return React.createElement("div", null, allPapers.map(function (p) { return paperRow(p, 0); }));
				}
				return React.createElement("div", null, projects.map(function (p) { return projectRow(p); }));
			}

			return React.createElement("div", { style: S.root },
				// section header: 研究区 title + expanding inline search + 2 trailing actions
				React.createElement("div", { style: Object.assign({}, S.header, { position: "relative" }) },
					React.createElement("span", { style: searchOpen ? Object.assign({}, S.label, S.labelHidden) : S.label }, "研究区"),
					React.createElement("div", { style: searchOpen ? Object.assign({}, S.searchSlot, S.searchSlotOn) : S.searchSlot },
						React.createElement("div", { style: searchOpen ? Object.assign({}, S.search, S.searchOn) : S.search, onClick: function () { setSearchOpen(true); searchRef.current && searchRef.current.focus(); } },
							React.createElement("button", { type: "button", style: S.iconBtn, title: "检索", onClick: function (e) { e.stopPropagation(); setSearchOpen(true); searchRef.current && searchRef.current.focus(); } }, React.createElement(IconSearch, { size: searchOpen ? 11 : 14 })),
							React.createElement("input", { ref: searchRef, className: "dsh-rr-searchinput", style: searchOpen ? Object.assign({}, S.searchInput, S.searchInputOn) : S.searchInput, type: "text", placeholder: "检索文献：标题 / 作者 / DOI", maxLength: 200, value: q, tabIndex: searchOpen ? 0 : -1, onChange: function (e) { setQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Escape") { setQ(""); setSearchOpen(false); } } }),
							searchOpen ? React.createElement("button", { type: "button", style: S.clearBtn, title: "清除", onClick: function (e) { e.stopPropagation(); setQ(""); setSearchOpen(false); } }, React.createElement(IconClose, { size: 12 })) : null,
						),
					),
					React.createElement("div", { style: searchOpen ? Object.assign({}, S.headerActions, S.headerActionsHidden) : S.headerActions },
						React.createElement("button", { type: "button", style: S.iconBtn, title: "检索在线文献库", onClick: function () { setResearchDetail(null); setResearchPreview(null); setResearchSearch({ q: "", title: "", author: "", doi: "", year_from: "", year_to: "", open_access: false, results: null, loading: false, error: null, form: true }); } }, React.createElement(IconSearch, { size: 16 })),
						React.createElement("button", { type: "button", style: S.iconBtn, title: "视图设置", onClick: function (e) { openViewMenu(e); } }, React.createElement(IconViewOptions, { size: 16 })),
						React.createElement("button", { type: "button", style: S.iconBtn, title: "新建项目", onClick: function () { setDialog({ kind: "newProject" }); } }, React.createElement(IconFolderAdd, { size: 16 })),
					),
				),
				React.createElement("div", { style: S.list }, listBody()),
				menu ? React.createElement(Dropdown, { x: menu.x, y: menu.y, items: menu.items, onSelect: function (id) { handleMenuSelect(menu.target, id); setMenu(null); }, onClose: function () { setMenu(null); } }) : null,
				dialog ? React.createElement(DialogForm, { dialog: dialog, projects: projects || [], onClose: function () { setDialog(null); }, onDone: function (kind, d) { setDialog(null); if (kind === "deletePaper" && removeSel) removeSel(d.paper.id); loadTree(); } }) : null,
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
				// 点击论文行只聚焦/打开右侧详情，不再自动勾选；
				// 勾选仅由行首 checkbox 的 toggleSel 触发。
				setResearchDetail(id); // right-column paper detail
			}, []);
			var toggleSel = useCallback(function (id) {
				setSel(function (s) {
					var n = Object.assign({}, s);
					if (n[id]) delete n[id]; else n[id] = true;
					return n;
				});
			}, []);
			var clearSel = useCallback(function () { setSel({}); setFocused(null); }, []);
			var removeSel = useCallback(function (id) {
				setSel(function (s) { var n = Object.assign({}, s); delete n[id]; return n; });
				setFocused(function (f) { return f === id ? null : f; });
			}, []);
			var selectedPapers = items.filter(function (p) { return sel[p.id]; });
			if (!wide) {
				return React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 10, color: "var(--dsw-alias-label-secondary, #666)" } },
					React.createElement("button", { style: { border: 0, background: "transparent", fontSize: 18, cursor: "pointer", padding: 6, color: "var(--dsw-alias-label-secondary, #666)" }, title: "研究区", onClick: function () { expandSidebar(); } }, "📚"),
				);
			}
			return React.createElement("div", { className: "dsh-rr-wide", style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
				!authReady ? React.createElement("p", { style: S.empty }, "研究区加载中…")
					: mode === "review" ? React.createElement(ReviewComposer, { papers: selectedPapers, onBack: function () { setMode(null); } })
					: mode === "writing" ? React.createElement(WritingComposer, { onBack: function () { setMode(null); } })
					: React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
						React.createElement(LibraryView, { sel: sel, toggleSel: toggleSel, focus: focus, focused: focused, removeSel: removeSel, onPapers: setItems, openDetails: props.openDetails }),
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

		exports.inject = ["slots", "layout"];
		exports.apply = function (ctx) {
			ctx.slots.inject("sidebar.research", function () {
				return ctx.slots.register({
					name: "sidebar.research",
					id: "research-workspace",
					inject: function () {
						return { openDetails: function () { ctx.layout.openDetails(); } };
					},
				}, ResearchRegion);
			});
			// right-column paper detail seat (patched ui-conversation details)
			ctx.slots.inject("conversation.details.research", function () {
				return ctx.slots.register(
					{ name: "conversation.details.research", id: "research-detail" },
					ResearchDetailPanel,
				);
			});
		};

		return module.exports;
	}
});
