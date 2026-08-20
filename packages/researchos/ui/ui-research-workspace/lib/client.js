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
		// IconGlobeOutline14 (online literature search) — from
		// @deepseek-ai/dsh-client-ui-primitives; distinguishes the online-library
		// affordance from the local 检索 magnifier.
		function IconGlobe(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M7.00018 0.353516C10.6708 0.353535 13.6468 3.32958 13.6469 7.00018C13.6468 10.6708 10.6708 13.6468 7.00018 13.6469C3.32957 13.6468 0.353535 10.6708 0.353516 7.00018C0.353535 3.32957 3.32957 0.353531 7.00018 0.353516ZM5.44643 7.59661C5.49463 8.97506 5.70762 10.191 6.02136 11.0793C6.20141 11.5891 6.40328 11.9585 6.59898 12.1889C6.79501 12.4196 6.93213 12.454 7.00018 12.454C7.06822 12.454 7.20533 12.4197 7.40138 12.1889C7.59708 11.9585 7.79895 11.589 7.979 11.0793C8.29274 10.191 8.50574 8.97506 8.55394 7.59661H5.44643ZM1.57861 7.59661C1.80785 9.70467 3.2386 11.4509 5.1715 12.1388C5.07135 11.9317 4.97972 11.7098 4.89746 11.477C4.53084 10.4391 4.30224 9.0828 4.25357 7.59661H1.57861ZM9.74679 7.59661C9.69813 9.0828 9.46952 10.4391 9.1029 11.477C9.0206 11.7099 8.92818 11.9316 8.82797 12.1388C10.7613 11.4511 12.1925 9.70496 12.4218 7.59661H9.74679ZM5.1706 1.8616C3.23814 2.54963 1.80876 4.29604 1.5795 6.40376H4.25357C4.30224 4.91756 4.53083 3.56129 4.89746 2.5234C4.97968 2.29066 5.07051 2.0686 5.1706 1.8616ZM7.00018 1.54637C6.93213 1.54638 6.79503 1.5807 6.59898 1.81145C6.40332 2.04177 6.20139 2.41058 6.02136 2.92012C5.70754 3.80851 5.49461 5.02499 5.44643 6.40376H8.55394C8.50575 5.025 8.29282 3.80851 7.979 2.92012C7.79898 2.41059 7.59705 2.04177 7.40138 1.81145C7.20531 1.58067 7.06823 1.54637 7.00018 1.54637ZM8.82887 1.8616C8.92902 2.0687 9.02064 2.29053 9.1029 2.5234C9.46953 3.56129 9.69812 4.91756 9.74679 6.40376H12.4209C12.1916 4.29575 10.7618 2.54943 8.82887 1.8616Z", fill: "currentColor" }),
			);
		}
		// IconResearch16 (document + magnifier): activity-bar 研究区 entry.
		function IconResearch(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M4.2 1.8h5.3a1 1 0 0 1 .7.3l1.7 1.7a1 1 0 0 1 .3.7v8.7a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" }),
				React.createElement("path", { d: "M9.8 2.2V4a1 1 0 0 0 1 1h1.6", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" }),
				React.createElement("circle", { cx: "7.2", cy: "9.4", r: "1.9", stroke: "currentColor", strokeWidth: 1.3 }),
				React.createElement("path", { d: "m8.7 10.9 1.5 1.5", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" }),
			);
		}
		// 2026-08-21 myf: IconWorkspace —— 工作区栏目图标（代码块 / 文件浏览，
		// 对应右侧 rail「工作区」条目）。风格与 IconResearch 一致（stroke 1.3）。
		function IconWorkspace(props) {
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M6.2 3.6 3 8l3.2 4.4", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" }),
				React.createElement("path", { d: "M9.8 3.6 13 8l-3.2 4.4", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" }),
				React.createElement("path", { d: "m10.2 1.8-4.4 12.4", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" }),
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
				// 2026-08-19 myf: 外层顶层 tab 钉在 detailPane 顶部（标题栏固定），
				// 内层 PDF/Card TabBar 不 sticky（双 sticky 会互相遮挡，
				// 内层只是内容切换，滚动时跟随内容自然消失即可）。
				// sticky 元素加背景，否则下方滚动内容会透过 tab 文字。
				// 2026-08-19 myf: sticky 条横向 -16px 撑满 details 列（抵消父容器
				// 16px 左右 padding），文字内缩 16px，滚动时背景铺满全宽不露缝。
				".dsh-rr-tabs { display: flex; align-items: center; gap: 2px; margin: 0 0 8px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }",
				".dsh-rr-tabs.dsh-rr-tabs-sticky { position: sticky; top: 0; z-index: 5; margin: 0 -16px 8px; padding: 4px 16px 0; background: var(--dsw-alias-bg-layer-1, #fff); }",
				".dsh-rr-tab { flex: none; padding: 8px 12px 7px; border: none; border-bottom: 2px solid transparent; background: transparent; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary, #666); cursor: pointer; }",
				".dsh-rr-tab:hover { color: var(--dsw-alias-label-primary, #111); }",
				".dsh-rr-tab.dsh-rr-tab-on { color: var(--dsw-alias-label-primary, #111); border-bottom-color: var(--dsw-alias-button-primary-fill); font-weight: 500; }",

				// 2026-08-21 myf: 工作区面板（WorkspacePanel）样式 —— 对齐 DSH 原生
				// sectionHeader（36px 标题 + headerActions）+ projectRow（高 34px / 字号 14px）
				// 的视觉节奏：行 32px、字号 14px、次级灰文字、暗色 hover 灰白 5% 叠加。
				".dsh-ws-row { display: flex; align-items: center; gap: 6px; height: 32px; box-sizing: border-box; border-radius: 6px; cursor: pointer; font-size: 14px; line-height: 18px; color: var(--dsw-alias-label-primary, #111); transition: background 100ms ease; padding: 0 8px; }",
				".dsh-ws-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.05)); }",
				".dsh-ws-row svg { display: block; }",
				// 文件/目录行右侧状态徽标统一样式（小圆角 + 醒目色，参考 git 状态）
				".dsh-ws-chip { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 4px; font-size: 12px; line-height: 18px; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06)); border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08)); color: var(--dsw-alias-label-secondary, #999); white-space: nowrap; }",
				".dsh-ws-chip svg { display: block; opacity: 0.7; }",
				// iconbtn 24x24（参考 DSH headerActions 内 28px 容器 + 16px 图标）
				".dsh-ws-iconbtn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #999); cursor: pointer; transition: background 100ms ease, color 100ms ease; }",
				".dsh-ws-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06)); color: var(--dsw-alias-label-primary, #111); }",
				// tab 栏：与 DSH 原生 dsh-rr-tabs 对齐 —— 36px 高，下边框 0.67px rgba(255,255,255,.12)
				".dsh-ws-tabs { display: flex; align-items: stretch; gap: 0; height: 36px; border-bottom: 0.67px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12)); margin-bottom: 4px; padding: 0 4px; }",
				".dsh-ws-tab { background: transparent; border: none; padding: 0 10px; height: 100%; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 400; color: var(--dsw-alias-label-secondary, #999); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -0.67px; transition: color 100ms ease, border-color 100ms ease; }",
				".dsh-ws-tab:hover { color: var(--dsw-alias-label-primary, #111); }",
				".dsh-ws-tab.dsh-ws-tab-on { color: var(--dsw-alias-label-primary, #111); font-weight: 500; border-bottom-color: var(--dsw-alias-button-primary-fill, #4f46e5); }",
				// 头部：标题 + 副信息 + 操作按钮 —— 仿 DSH sectionHeader 的 36px 行高节奏
				".dsh-ws-header { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 4px; }",
				".dsh-ws-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); white-space: nowrap; }",
				"@keyframes dsh-ws-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }",
				".dsh-ws-spin { animation: dsh-ws-spin 700ms linear infinite; }",
				// 2026-08-21 myf: Diff 视图使用统一视图内联样式（WSDiffView），
				// 不再依赖全局 CSS 类；此注释保留说明。

				// 2026-08-21 myf: 文件预览代码块（dsh-ws-code）= 暗色卡片，
				// 行高 1.55、字号 12、padding 12 14、横向滚动（保留代码原始宽度），
				// 不强制 pre-wrap（避免 yaml 长 `===` 行被截成多行）。
				".dsh-ws-code { margin: 0; padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); font-size: 12px; line-height: 1.55; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #d4d4d4; overflow-x: auto; white-space: pre; tab-size: 2; }",
				// 2026-08-21 myf: Markdown 预览容器 —— 卡片化、上下留白，
				// 与代码块同宽度节奏。
				".dsh-ws-md { padding: 4px 2px 16px; color: #d4d4d4; }",
				// 2026-08-21 myf: 内容滚动区，独立滚动条，不挤压头部。
				".dsh-ws-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 4px 16px; }",

				// Right-edge fixed tool-window rail (IDEA right tool-window bar / VS Code
				// left activity bar). Pinned to the window's far-right edge with
				// position:fixed (mounted on document.body by apply, see ResearchRail),
				// independent of the AppFrame three-column grid — it stays visible
				// even when the details column is collapsed. Top-level columns
				// (研究区 / 代码区 …) are configured by RESEARCH_RAIL_ITEMS.
				".dsh-rr-railbar { position: fixed; right: 0; top: 0; bottom: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 46px; padding: 8px 0; box-sizing: border-box; background: var(--dsw-alias-bg-layer-1, #1a1a1a); border-left: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08)); }",
				".dsh-rr-rail { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; height: 100%; padding: 8px 0; box-sizing: border-box; }",
				".dsh-rr-railbtn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #666); cursor: pointer; }",
				".dsh-rr-railbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: var(--dsw-alias-label-primary, #111); }",
				".dsh-rr-railbtn.dsh-rr-railbtn-on { color: var(--dsw-alias-label-primary, #111); background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }",
				".dsh-rr-railbtn.dsh-rr-railbtn-on::before { content: \"\"; position: absolute; left: -8px; top: 7px; bottom: 7px; width: 2px; border-radius: 2px; background: var(--dsw-alias-button-primary-fill); }",
				".dsh-rr-rail-tip { position: absolute; left: 50%; bottom: -20px; transform: translateX(-50%); z-index: 80; padding: 2px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3, #333); color: var(--dsw-alias-label-on-color, #fff); font-size: 11px; line-height: 16px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 120ms var(--ds-ease-in-out, ease); }",
				".dsh-rr-railbtn:hover .dsh-rr-rail-tip { opacity: 1; }",
				// 2026-08-20 myf: 右侧竖排栏目 rail（IDEA tool-window 风格）。
				// railcol = details 列内左侧竖条，条目由 RESEARCH_RAIL_ITEMS
				// 配置驱动（未来拓展「代码区」等栏目只需向数组 push 一条）。
				".dsh-rr-railcol { flex: none; width: 46px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; box-sizing: border-box; border-right: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); background: var(--dsw-alias-bg-layer-2, #fafafa); }",
				".dsh-rr-railcol .dsh-rr-railbtn { width: 34px; height: 34px; }",
				// tooltip 改为向右弹出（rail 在列内左侧，下方会被内容区遮挡）
				".dsh-rr-railcol .dsh-rr-rail-tip { left: 100%; top: 50%; bottom: auto; transform: translateY(-50%); margin-left: 6px; }",
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
			root: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", boxSizing: "border-box", paddingRight: INSET, position: "relative" },
			// list seat: expands right past root's paddingRight (mirrors ui-workspace
			// .listArea) so rows/scrollbar share the session list's right edge
			// (sidebar right - scrollbar offset), keeping row hover insets identical.
			listArea: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginLeft: -4, marginRight: "calc(-1 * " + INSET + ")", paddingLeft: 4, boxSizing: "border-box" },
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
			checkbox: { flex: "none", width: 16, height: 16, margin: 0, cursor: "pointer", accentColor: "var(--dsw-alias-button-primary-fill)" },
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
			// 2026-08-19 myf: 论文原始 keywords（来自 paper_agent LLM 抽取的 4-8
			// 个）。原 AI tags（胶囊样式）已移除（用户不需要），保留 keywords。
			kw: { display: "inline-block", fontSize: 10.5, padding: "0 6px", borderRadius: 4, border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", color: "var(--dsw-alias-label-secondary, #666)", margin: "0 3px 2px 0", lineHeight: "16px" },
			fieldLabel: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 1, display: "block" },
			text: { fontSize: 13, lineHeight: 1.5, color: "var(--dsw-alias-label-primary, #111)", margin: "0 0 2px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
			// inputs / buttons
			input: { boxSizing: "border-box", width: "100%", height: 36, padding: "7px 14px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 18, outline: "none", background: "transparent", fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-label-primary, #111)" },
			textarea: { boxSizing: "border-box", width: "100%", minHeight: 80, padding: "7px 14px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 14, outline: "none", background: "transparent", fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-label-primary, #111)", resize: "vertical" },
			btn: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			// 2026-08-19 myf: 主按钮颜色完全走主题变量（对齐官方 Button .primary 无回退写法），去掉硬编码回退色
			btnPrimary: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-button-primary-fill)", color: "var(--dsw-alias-label-primary-foreground)", cursor: "pointer" },
			// 2026-08-19 myf: 批量删除操作按钮（危险色，走主题 error 变量）
			btnDanger: { padding: "5px 12px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--dsw-alias-state-error-primary, #dc2626)", color: "var(--dsw-alias-label-on-color, #fff)", cursor: "pointer" },
			select: { padding: "5px 10px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))", borderRadius: 8, fontSize: 13, background: "transparent", color: "var(--dsw-alias-label-primary, #111)", outline: "none" },
			field: { marginBottom: 6 },
			// bottom action bar (right inset aligned to the tree's S.root
			// paddingRight so the bar's width/edges match the workspace list)
			bar: { flex: "none", display: "flex", alignItems: "center", gap: 6, marginRight: INSET, padding: "6px " + INSET, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))", boxSizing: "border-box" },
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
			// 2026-08-19 myf: 引用弹窗（APA / MLA / GBT 三栏）
			citeBlock: { marginBottom: 12 },
			citeBlockHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
			citeBlockLabel: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-label-secondary, #666)" },
			citeBlockCopy: { padding: "3px 10px", fontSize: 11, borderRadius: 6, border: "none", background: "var(--dsw-alias-button-elevated-fill, #fff)", color: "var(--dsw-alias-label-primary, #111)", boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12))", cursor: "pointer" },
			citeBlockCopyOk: { color: "var(--dsw-alias-state-success-primary, #16a34a)" },
			citeBlockText: { fontSize: 12, lineHeight: 1.6, padding: "8px 10px", borderRadius: 8, background: "var(--dsw-alias-bg-layer-1, #f6f7f9)", color: "var(--dsw-alias-label-primary, #111)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-serif, Georgia, 'Times New Roman', serif" },
		};

		// Shared right-column research selection: the region writes it on a
		// paper click, the `conversation.details.research` seat reads it (both
		// registers live in this package, so a module-level signal is safe).
		var researchDetail = { paperId: null, nonce: 0 };
		var researchSubs = [];
		function setResearchDetail(id) {
			researchDetail.paperId = id;
			researchDetail.nonce++;
			// 2026-08-19 myf: 任何 paper action 都把右窗栏切到「论文详细」tab。
			// 这样外部预览 / 检索 / 综述 / 写作 tab 都不会被单论文点击意外关闭。
			setResearchPanelTab("paper");
			for (var i = 0; i < researchSubs.length; i++) researchSubs[i](researchDetail);
		}
		// 2026-08-19 myf: 强制右窗栏重新拉取当前论文详情（上传完成自动刷新解析结果用）。
		function refreshResearchDetail() {
			researchDetail.nonce++;
			for (var i = 0; i < researchSubs.length; i++) researchSubs[i](researchDetail);
		}
		function subscribeResearchDetail(fn) {
			researchSubs.push(fn);
			return function () {
				researchSubs = researchSubs.filter(function (x) { return x !== fn; });
			};
		}

		// 2026-08-19 myf: 研究树版本号——左侧 LibraryView 每次成功刷新树（新建/
		// 移动文件夹、删除、上传等）后 bump，右窗综述目录订阅后及时同步刷新。
		var researchTreeNonce = { v: 0 };
		var researchTreeSubs = [];
		function bumpResearchTree() {
			researchTreeNonce.v++;
			for (var i = 0; i < researchTreeSubs.length; i++) researchTreeSubs[i](researchTreeNonce.v);
		}
		function subscribeResearchTree(fn) {
			researchTreeSubs.push(fn);
			return function () {
				researchTreeSubs = researchTreeSubs.filter(function (x) { return x !== fn; });
			};
		}

		// 2026-08-19 myf: 树元信息（项目 + 文件夹）广播——左栏 LibraryView 拉树成功后
		// 通过这里推给 ResearchSidebar，让批量移动弹窗能拿到目标文件夹列表
		// （不重复请求 /research-folder 与 /research-project）。
		var researchTreeMeta = { projects: [], foldersByProject: {} };
		var researchTreeMetaSubs = [];
		function setResearchTreeMeta(projects, foldersByProject) {
			researchTreeMeta.projects = projects || [];
			researchTreeMeta.foldersByProject = foldersByProject || {};
			for (var i = 0; i < researchTreeMetaSubs.length; i++) researchTreeMetaSubs[i](researchTreeMeta);
		}
		function subscribeResearchTreeMeta(fn) {
			researchTreeMetaSubs.push(fn);
			fn(researchTreeMeta);
			return function () {
				researchTreeMetaSubs = researchTreeMetaSubs.filter(function (x) { return x !== fn; });
			};
		}

		// Shared right-column literature search: the 文献检索 action publishes a
		// result set here; the details seat renders it when no paper is focused.
		var researchSearch = { state: null }; // { query, results, loading } | null
		var researchSearchSubs = [];
		// 2026-08-19 myf: 记录「在线文献检索」域内最后停留的视图：'search'（结果列表）
		// 或 'preview'（外部预览详情）。从 preview 切到其他 tab 再切回时恢复 preview，
		// 而不是回到结果列表。
		var researchSearchView = "search";
		function setResearchSearch(state) {
			researchSearch.state = state;
			researchSearchView = "search";
			// 2026-08-19 myf: 设置搜索时切到「在线文献检索」tab。
			setResearchPanelTab("search");
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

		// 2026-08-19 myf: 引用弹窗请求：搜索结果面板点击「引用」按钮后通过这里推送
		// 选中的文献给外部预览面板，弹出 APA / MLA / GBT 三种格式（仅在前端生成，
		// 不入后端）。预览面板订阅后显示 CitationDialog 弹窗。
		var researchCitation = { paper: null };
		var researchCitationSubs = [];
		function setResearchCitation(paper) {
			researchCitation.paper = paper;
			for (var i = 0; i < researchCitationSubs.length; i++) researchCitationSubs[i](paper);
		}
		function subscribeResearchCitation(fn) {
			researchCitationSubs.push(fn);
			return function () {
				researchCitationSubs = researchCitationSubs.filter(function (x) { return x !== fn; });
			};
		}

		// External-result PDF preview request: clicking a result that carries a
		// pdf_url opens a dsh-native PDF preview in the seat (iframe embed; the
		// toolbar falls back to a new-tab link for frame-blocking hosts).
		var researchPreview = { paper: null };
		var researchPreviewSubs = [];
		function setResearchPreview(paper) {
			researchPreview.paper = paper;
			// 2026-08-19 myf: 切到「外部预览」tab（论文来源是检索结果时使用）。
			researchSearchView = "preview";
			setResearchPanelTab("preview");
			for (var i = 0; i < researchPreviewSubs.length; i++) researchPreviewSubs[i](paper);
		}
		function subscribeResearchPreview(fn) {
			researchPreviewSubs.push(fn);
			return function () {
				researchPreviewSubs = researchPreviewSubs.filter(function (x) { return x !== fn; });
			};
		}

		// 2026-08-19 myf: 右窗栏 tab 路由。kind ∈ 'paper' | 'preview' | 'search' |
		// 'review' | 'writing' | null。null = 关闭右窗栏（同时 paperId/preview/
		// search 数据保留，下次切回时直接显示）。
		// 任何 setResearchDetail / setResearchPreview / setResearchSearch 都会自动
		// 切到对应 tab。底部栏「综述 / 写作」按钮调用 setResearchPanelTab 切到
		// 对应 composer（toggle：再次点击同 tab 关闭 = null）。
		var researchPanelTab = { kind: null, lastKind: null };
		// 2026-08-21 myf: 恢复误删的订阅者数组（上次编辑时被覆盖掉，
		// 导致 subscribeResearchPanelTab 抛 ReferenceError，rail 整块渲染失败）
		var researchPanelTabSubs = [];
		function setResearchPanelTab(kind) {
			// 2026-08-19 myf: 记录上次打开过的 tab —— 竖栏「研究区」收起内容后
			// 再点一次能恢复用户上次停留的 tab，而不是固定回论文详细。
			// 2026-08-21 myf: lastKind 只记录研究区 tab（workspace 是独立栏目，
			// 不属于研究区横排 tab；否则切回研究区会错误恢复到工作区）。
			if (kind && kind !== "workspace") researchPanelTab.lastKind = kind;
			researchPanelTab.kind = kind;
			for (var i = 0; i < researchPanelTabSubs.length; i++) researchPanelTabSubs[i](kind);
		}
		function subscribeResearchPanelTab(fn) {
			researchPanelTabSubs.push(fn);
			return function () {
				researchPanelTabSubs = researchPanelTabSubs.filter(function (x) { return x !== fn; });
			};
		}

		// 2026-08-19 myf: 多选选区提到 module-level store，dsh 切 conversation
		// 卸载重挂 sidebar.research 时选区不丢。键 = paperId，值 = paper 引用。
		var researchSelection = {};
		var researchSelectionSubs = [];
		function setResearchSelection(next) {
			researchSelection = next;
			for (var i = 0; i < researchSelectionSubs.length; i++) researchSelectionSubs[i](next);
		}
		function subscribeResearchSelection(fn) {
			researchSelectionSubs.push(fn);
			return function () {
				researchSelectionSubs = researchSelectionSubs.filter(function (x) { return x !== fn; });
			};
		}

		// Paper Intelligence Card detail (preview + card + author info).
		// cardData = card (from /card endpoint) or detail.summary (from detail endpoint);
		// both return parseSummary(paper.summary) — identical data, but the detail
		// endpoint may complete faster so we cover both.
		function PaperDetail(props) {
			var detail = props.detail, card = props.card;
			var cardData = card || detail.summary;
			// 2026-08-19 myf: 加上 keywords（论文原始关键词，弱化样式与 AI tags
			// 区分）和 workflow（4-8 句完整实验流程）。原 5 字段保留。
			var fields = [
				["Abstract", cardData ? cardData.abstract : ""],
				["Method", cardData ? cardData.method : ""],
				["Finding", cardData ? cardData.finding : ""],
				["Limitation", cardData ? cardData.limitation : ""],
				["Future work", cardData ? cardData.future_work : ""],
				["Workflow", cardData ? cardData.workflow : ""],
			];
			// keywords: 兼容 array（新版）或 comma-separated string（旧版）
			var kws = cardData && cardData.keywords;
			var kwList = Array.isArray(kws) ? kws : (typeof kws === "string" && kws.trim() ? kws.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : []);
			return React.createElement("div", { style: S.detail },
				React.createElement("p", { style: S.detailTitle }, detail.title || "(untitled)"),
				React.createElement("p", { style: S.detailMeta }, (detail.authors || "—") + (detail.year ? " · " + detail.year : "") + (detail.doi ? " · DOI: " + detail.doi : "")),
				// 2026-08-19 myf: 不再渲染 cardData.tags（AI 推理标签），只保留论文
				// 原始 keywords。AI tags 在 knowledge graph 那边单独呈现。
				kwList.length ? React.createElement("div", { style: { marginBottom: 6 } },
					React.createElement("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)", marginRight: 4 } }, "Keywords:"),
					kwList.map(function (k, i) { return React.createElement("span", { key: "kw-" + i, style: S.kw }, k); }),
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
		// application/pdf bytes — we then render in the browser's native
		// PDF viewer via iframe).
		function PdfPreview(props) {
			var src = props.src || "";
			var title = props.title || "(PDF)";
			var isExternal = /^https?:\/\//i.test(src);
			var pdfUrl = isExternal
				? ("/research-external-search/pdf?url=" + encodeURIComponent(src))
				: ("/research-file/files/" + encodeURIComponent(src).replace(/%2F/g, "/"));
			return React.createElement(PdfViewer, { url: pdfUrl, title: title });
		}

		// PDF viewer — 浏览器原生 viewer（iframe 内嵌）。
		// 2026-08-21 myf: 由自绘 pdf.js canvas 单页渲染改为内嵌浏览器原生 PDF
		// viewer。主流浏览器（Chrome/Edge/Safari/Firefox）均内置完整 PDF 阅读器：
		// 缩放 / 搜索 / 翻页 / 文字选中复制 / 打印 / 下载，体验与系统打开 PDF 一致。
		// 旧实现问题：canvas 单页渲染无法选中复制文字、滚轮不连续翻页、工具栏简陋
		// （用户反馈「非常不好用」）；且依赖 jsDelivr CDN 加载 pdfjs-dist。
		// 新实现零依赖，保留顶部标题条 + 「新窗口打开」入口。
		// 2026-08-21 myf: 原生 viewer 的工具栏在 iframe 宽度不足时会被浏览器
		// 响应式折叠隐藏次要按钮（iframe 跨域无法用 CSS 干预内部）；曾用外层
		// 横向滚动 + iframe minWidth 兜底，但窄栏时要拖动滚动条才能看全按钮，
		// 体验差。改为 #toolbar=0 隐藏原生工具栏，把按钮做进我们自己渲染的
		// 标题条（新窗口打开 / 下载），任意宽度下按钮始终完整可见。
		function PdfViewer(props) {
			var isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
			var wrapBg = isDark ? "#1e1e1e" : "#fff";
			var wrapBorder = isDark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)";
			var labelColor = isDark ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.55)";
			var strongColor = isDark ? "rgba(255,255,255,.92)" : "rgba(0,0,0,.85)";
			// 下载文件名：优先标题，兜底取 URL 最后一段。
			var downloadName = (props.title || "").trim() || (props.url.split("/").pop() || "paper.pdf");
			return React.createElement("div", { style: { width: "100%", border: "1px solid " + wrapBorder, borderRadius: 12, background: wrapBg, boxSizing: "border-box", overflow: "hidden" } },
				React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderBottom: "1px solid " + wrapBorder, color: strongColor, fontSize: 12, userSelect: "none" } },
					React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: labelColor, marginRight: 4 } }, props.title || "(PDF)"),
					React.createElement("a", { href: props.url, download: downloadName, title: "下载 PDF", style: { flex: "none", color: labelColor, fontSize: 11, textDecoration: "none", padding: "2px 6px", border: "1px solid " + wrapBorder, borderRadius: 6 } }, "下载"),
					React.createElement("a", { href: props.url, target: "_blank", rel: "noreferrer", title: "在新窗口打开", style: { flex: "none", color: labelColor, fontSize: 11, textDecoration: "none", padding: "2px 6px", border: "1px solid " + wrapBorder, borderRadius: 6 } }, "新窗口打开"),
				),
				// #toolbar=0 隐藏浏览器原生工具栏（Chrome/Edge/pdf.js 均遵循；
				// Safari 原生 PDF 显示本无工具栏），避免窄栏时按钮被响应式折叠，
				// 功能按钮由上方自绘标题条承载。PDF 内容仍由浏览器原生渲染，
				// 支持文字选中复制 / 滚轮翻页 / Ctrl+滚轮缩放。
				React.createElement("iframe", {
					src: props.url + "#toolbar=0&navpanes=0&view=FitH",
					title: props.title || "(PDF)",
					style: { display: "block", width: "100%", height: "min(calc(100vh - 220px), 860px)", minHeight: 420, border: "none", background: "#fff" },
				}),
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
			// 2026-08-19 myf: 未检索（results 为 null）时显示「输入条件…」而非「无匹配文献」
			var conds = [];
			if (s.title) conds.push("标题:" + s.title);
			if (s.author) conds.push("作者:" + s.author);
			if (s.doi) conds.push("DOI:" + s.doi);
			if (s.q) conds.push("关键词:" + s.q);
			if (s.year_from || s.year_to) conds.push((s.year_from || "") + "–" + (s.year_to || ""));
			if (s.open_access) conds.push("仅开放获取");
			var meta = conds.length ? conds.join(" · ") : (s.loading || s.results ? "检索条件" : "输入条件开始检索在线文献库");
			return React.createElement("div", { style: S.rsRoot },
				// 2026-08-19 myf: 移除面板自带头部（在线文献检索标题 + 关闭按钮），
				// 标题统一由 DetailsPanel 的 ResearchDetailTitle 渲染，避免两个顶部
				React.createElement("p", { style: S.rsMeta }, meta + (s.loading ? " · 检索中…" : (s.results ? " · " + s.results.length + " 条结果" : ""))),
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
						// 2026-08-19 myf: 与「生成综述」「下载 PDF」风格一致（白底+细边框），不抢主色
						React.createElement("button", { type: "button", style: S.btn, onClick: doSearch }, "检索"),
					),
				),
				s.loading ? React.createElement("p", { style: S.empty }, "检索中…")
					: s.error ? React.createElement("p", { style: S.err }, s.error)
					: !s.results ? React.createElement("p", { style: S.empty }, "输入条件开始检索在线文献库")
					: s.results.length === 0 ? React.createElement("p", { style: S.empty }, "无匹配文献")
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
								React.createElement("button", { type: "button", style: S.btn, title: "查看 APA / MLA / GBT 引用格式", onClick: function () { setResearchCitation(p); } }, "引用"),
								React.createElement("button", { type: "button", style: S.btn, title: "导入到研究区", onClick: function () { setResearchImport(p); } }, "导入"),
							),
							p.abstract ? React.createElement("p", { className: "dsh-rr-abst" }, p.abstract) : null,
						);
					})),
			);
		}

		// Right-column seat (conversation.details.research): routes by panel tab
		// (论文详细 / 在线文献检索 / 综述 / 写作). Clicking a result / paper /
		// searching / bottom-bar composer button switches the tab; the close
		// button on the dsh DetailsPanel title bar clears the tab (right column
		// collapses). The internal PDF/Paper Card tab inside 论文详细 keeps
		// its existing look — only the top-level tab strip is new here.
		function ResearchDetailPanel(props) {
			var [paperId, setPaperId] = useState(researchDetail.paperId);
			var [nonce, setNonce] = useState(researchDetail.nonce);
			var [search, setSearch] = useState(researchSearch.state);
			var [preview, setPreview] = useState(researchPreview.paper);
			var [tab, setTab] = useState(researchPanelTab.kind);
			var [detail, setDetail] = useState(null);
			var [card, setCard] = useState(null);
			var [innerTab, setInnerTab] = useState("pdf");
			// 2026-08-19 myf: 引用弹窗订阅——搜索结果面板点击「引用」时弹出。
			var [citation, setCitation] = useState(null);
			useEffect(function () { return subscribeResearchCitation(setCitation); }, []);
			useEffect(function () { return subscribeResearchDetail(function (rd) { setPaperId(rd.paperId); setNonce(rd.nonce); }); }, []);
			useEffect(function () { return subscribeResearchSearch(setSearch); }, []);
			useEffect(function () { return subscribeResearchPreview(setPreview); }, []);
			useEffect(function () { return subscribeResearchPanelTab(setTab); }, []);
			// 2026-08-19 myf: 依赖 nonce（上传完成自动刷新）；PROCESSING/UPLOADED 每 3s
			// 轮询直到 READY，使「上传后自动获取最新解析结果」无需手动重开详情。
			useEffect(function () {
				if (paperId == null || tab !== "paper") { setDetail(null); setCard(null); return; }
				setDetail(null); setCard(null);
				var timer = null;
				function fetchAll() {
					api("/research-paper/papers/" + paperId).then(function (j) {
						if (!ok(j)) return;
						setDetail(j.data);
						var st = j.data && j.data.status;
						if (st === "PROCESSING" || st === "UPLOADED") timer = setTimeout(fetchAll, 3000);
					});
					api("/research-paper/papers/" + paperId + "/card").then(function (j) { if (ok(j) && j.data) setCard(j.data); });
				}
				fetchAll();
				return function () { if (timer) clearTimeout(timer); };
			}, [paperId, nonce, tab]);
			// 2026-08-20 myf: 竖栏 rail 为一级栏目入口（研究区/代码区…），
			// 展开的详细页内保留本横排 tab 条切换 论文详细/检索/综述/写作。
			function topTabs() {
				if (!tab) return null;
				var items = [
					{ key: "paper", label: "论文详细" },
					{ key: "search", label: "在线文献检索" },
					{ key: "review", label: "综述" },
					{ key: "writing", label: "写作" },
				];
				return React.createElement("div", { className: "dsh-rr-tabs dsh-rr-tabs-sticky" },
					items.map(function (it) {
						// 2026-08-19 myf: preview 详情属于「在线文献检索」域：高亮 search tab；
						// 点击时若上次停留在 preview 详情则恢复 preview，而不是回到结果列表。
						var on = it.key === tab || (it.key === "search" && tab === "preview");
						return React.createElement("button", {
							type: "button",
							key: it.key,
							className: "dsh-rr-tab" + (on ? " dsh-rr-tab-on" : ""),
							onClick: function () {
								if (it.key === "search" && researchSearchView === "preview" && researchPreview.paper) {
									setResearchPanelTab("preview");
								} else {
									setResearchPanelTab(it.key);
								}
							},
						}, it.label);
					}),
				);
			}
			// 外层：研究区 tab 内容直接铺满 details 列；竖栏入口已上移为窗口
			// 最右侧 activity rail（ResearchActivityBar，见 apply 注册）。
			// tab=null 时显示空态提示（details 列仍可被最右竖栏/左侧论文打开）。
			function tabContent() {
				// 2026-08-21 myf: 工作区栏目 —— 文件浏览 / git 变更 / diff 预览。
				// 不显示研究区横排 tab（workspace 有自己的「变更/文件」切换）。
				if (tab === "workspace") {
					return React.createElement("div", { style: S.rsRoot },
						React.createElement(WorkspacePanel, null),
					);
				}
				if (tab === "review") {
					// 2026-08-19 myf: 综述 composer 自加载当前已上传论文目录（checkbox 勾选），
					// 不再依赖左侧勾选同步。关闭 = setResearchPanelTab(null)。
					return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement(ReviewComposer, null),
					);
				}
				if (tab === "writing") {
					return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement(WritingComposer, null),
					);
				}
				if (tab === "search") {
					// 2026-08-19 myf: 右窗栏的在线文献检索 tab 自带检索表单，
					// 不再显示「在文献检索按钮上发起一次检索」的空态提示。
					return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement(SearchResultsPanel, { search: search || {} }),
					);
				}
				if (tab === "paper") {
					if (paperId == null) return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement("p", { style: S.empty }, "点击研究区一篇论文查看详情"),
					);
					if (!detail) return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement("p", { style: S.empty }, "加载论文详情…"),
					);
					var pdfSrc = detail.pdfUrl || detail.pdf_url || null;
					return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement(TabBar, { tabs: [{ key: "pdf", label: "PDF 预览" }, { key: "card", label: "Paper Card" }], active: innerTab, onSelect: setInnerTab }),
						innerTab === "card" ? React.createElement(PaperDetail, { detail: detail, card: card })
							: pdfSrc ? React.createElement(PdfPreview, { src: pdfSrc, title: detail.title || "(PDF)" })
							: React.createElement("p", { style: S.empty }, "该论文没有可预览的 PDF 文件"),
					);
				}
				if (tab === "preview") {
					var p = preview;
					if (!p) return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement("p", { style: S.empty }, "点击在线文献检索结果中的论文查看"),
					);
					return React.createElement("div", { style: S.rsRoot },
						topTabs(),
						React.createElement("div", { style: S.rsHead },
							React.createElement("div", null,
								React.createElement("p", { style: S.rsTitle }, p.title || "(untitled)"),
								React.createElement("p", { style: S.rsMeta }, sourceLabel(p.source) ? sourceLabel(p.source) + " · " : "" + (p.year ? p.year + " · " : "") + (p.doi ? "DOI: " + p.doi : "")),
							),
							// 2026-08-19 myf: 返回结果列表改为 ← 图标按钮，置于论文标题右侧；
							// 同时把 search 域视图重置为结果列表，下次切回时不再自动恢复 preview。
							React.createElement("button", { type: "button", title: "返回结果列表", style: Object.assign({}, S.iconBtn, { borderRadius: 6, fontSize: 16 }), onClick: function () { researchSearchView = "search"; setResearchPanelTab("search"); } }, "←"),
						),
						React.createElement(TabBar, { tabs: [{ key: "pdf", label: "PDF 预览" }, { key: "card", label: "Paper Card" }], active: innerTab, onSelect: setInnerTab }),
						innerTab === "card" ? React.createElement(ExternalPaperCard, { paper: p })
							: p.pdf_url ? React.createElement(PdfPreview, { src: p.pdf_url, title: p.title || "(PDF)" })
							: React.createElement("p", { style: S.empty }, "该文献没有可预览的 PDF 文件"),
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" } },
							p.url ? React.createElement("a", { key: "src", href: p.url, target: "_blank", rel: "noopener", style: Object.assign({}, S.btn, { textDecoration: "none", display: "inline-block" }) }, "打开原文 ↗") : null,
							p.pdf_url ? React.createElement("a", { key: "dl", href: proxyPdfUrl(p), download: pdfDownloadLabel(p), style: Object.assign({}, S.btn, { textDecoration: "none", display: "inline-block" }) }, "下载 PDF") : null,
							// 2026-08-19 myf: 导入到研究区按钮样式与「下载 PDF」保持一致（btn 而非 btnPrimary）
							React.createElement("button", { key: "imp", type: "button", style: S.btn, onClick: function () { setResearchImport(p); } }, "导入到研究区"),
						),
					);
				}
				return null;
			}
			// 外层：研究区 tab 内容直接铺满 details 列；竖栏入口已上移为窗口
			// 最右侧 activity rail（ResearchActivityBar，见 apply 注册）。
			// tab=null 时显示空态提示（details 列仍可被最右竖栏/左侧论文打开）。
			if (!tab) return React.createElement("div", { style: S.rsRoot },
				React.createElement("p", { style: S.empty }, "在左侧研究区选择一篇论文，查看论文详细 / 在线文献检索 / 综述 / 写作"),
			);
			return React.createElement(React.Fragment, null,
				tabContent(),
				// 2026-08-19 myf: 引用弹窗——搜索结果面板点击「引用」时弹出，关闭后清空。
				citation ? React.createElement(CitationDialog, { paper: citation, onClose: function () { setResearchCitation(null); setCitation(null); } }) : null,
			);
		}

		// 2026-08-19 myf: 引用弹窗（APA / MLA / GBT 三种格式，一键复制到剪贴板）。
		// 格式在前端用 citeAPA / citeMLA / citeGBT 纯函数生成，不依赖后端。
		function CitationDialog(props) {
			var paper = props.paper;
			var [copied, setCopied] = useState(null); // 'apa' | 'mla' | 'gbt' | null
			var formats = [
				{ key: "apa", label: "APA (7th)", text: citeAPA(paper) },
				{ key: "mla", label: "MLA (9th)", text: citeMLA(paper) },
				{ key: "gbt", label: "GBT 7714-2015", text: citeGBT(paper) },
			];
			function doCopy(key, text) {
				copyToClipboard(text).then(function (ok) {
					if (ok) {
						setCopied(key);
						setTimeout(function () { setCopied(function (c) { return c === key ? null : c; }); }, 1500);
					}
				});
			}
			return React.createElement(Modal, {
				title: "引用 · " + (paper.title || "(untitled)"),
				onClose: props.onClose,
				footer: [
					React.createElement("button", { key: "close", type: "button", style: S.btn, onClick: props.onClose }, "关闭"),
				],
			},
				formats.map(function (f) {
					return React.createElement("div", { key: f.key, style: S.citeBlock },
						React.createElement("div", { style: S.citeBlockHead },
							React.createElement("span", { style: S.citeBlockLabel }, f.label),
							React.createElement("button", {
								type: "button",
								style: Object.assign({}, S.citeBlockCopy, copied === f.key ? S.citeBlockCopyOk : null),
								onClick: function () { doCopy(f.key, f.text); },
							}, copied === f.key ? "✓ 已复制" : "复制"),
						),
						React.createElement("div", { style: S.citeBlockText }, f.text),
					);
				}),
			);
		}

		// 2026-08-21 myf: 工作区栏目 —— 右侧 details 列内的「工作区」面板。
		// 数据源 = research-workspace bundle（/research-workspace/*）：
		//   overview → 分支名 + 文件树 + git 变更列表（M/A/D/U 徽标）
		//   content  → 文件内容预览（文本直接显示，图片/PDF 走 raw 直读）
		//   diff     → 单文件 git diff（带行级着色）
		// 布局：头部（分支徽标 + 变更数 + 刷新）→ 视图切换（变更 / 文件）→
		// 列表区。点击文件进入预览视图（内容 / Diff 双 tab，返回按钮回列表）。
		// 目录可折叠（collapsed state）；文件树来自 overview.files（相对路径）。
		// 2026-08-21 myf: v2 —— 界面打磨：行 hover 高亮（CSS 类）、按扩展名
		// 着色文件图标、变更行 submodule 识别（避免「路径=文件名」重复显示）、
		// diff 加减行背景块、刷新按钮 SVG 图标 + 加载旋转、文件视图根目录名
		// 提示 + 全部展开/折叠、spinner 加载态。

		// 2026-08-21 myf: 文件图标统一用次级灰（继承 .dsh-ws-row 的 color 变量），
		// 避免 VS Code 风格的高饱和彩色与 DSH 原生 rail 的灰白节奏冲突；
		// 状态色由同行的 WSStatusBadge 承担，图标本身保持中性。
		// 2026-08-20 myf: VS Code 风格文件类型图标 —— 按扩展名显示品牌色
		// 标签（TS/JS/PY/MD…），未识别扩展名用通用文件轮廓（灰）。替代原
		// WSIconFile 的纯文件轮廓，让变更树一眼区分文件类型。
		var WS_FILE_EXT_COLORS = {
			py: "#3572A5", js: "#F1E05A", jsx: "#61DAFB", mjs: "#F1E05A", cjs: "#F1E05A",
			ts: "#3178C6", tsx: "#3178C6", java: "#E76F00", go: "#00ADD8", rs: "#DEA584",
			c: "#A8B8C8", h: "#A8B8C8", cpp: "#F34B7D", cc: "#F34B7D", hpp: "#F34B7D", cs: "#178600",
			rb: "#CC342D", php: "#4F5D95", sh: "#89E051", bash: "#89E051", zsh: "#89E051",
			yml: "#CB171E", yaml: "#CB171E", json: "#FBC02D", toml: "#9C4221", sql: "#E38C00",
			ini: "#8B9BAA", conf: "#8B9BAA", cfg: "#8B9BAA", env: "#89E051",
			css: "#563D7C", scss: "#C6538C", less: "#1D365D",
			html: "#E34C26", htm: "#E34C26", xml: "#E34C26", svg: "#FFB13B", vue: "#42B883",
			md: "#519ABA", markdown: "#519ABA", mdx: "#519ABA",
			lock: "#8B9BAA", txt: "#8B9BAA", log: "#8B9BAA", csv: "#3C873A",
		};
		var WS_FILE_NAME_LABEL = {
			"package.json": "PKG", "tsconfig.json": "TSC", "jsconfig.json": "JSC",
			"package-lock.json": "LCK", "pnpm-lock.yaml": "LCK", "yarn.lock": "LCK",
			".gitignore": "GIT", ".gitattributes": "GIT", ".editorconfig": "EDT",
			".eslintrc": "ESL", ".prettierrc": "PRT", "dockerfile": "DKR",
			"makefile": "MK", "gemfile": "RB", "rakefile": "RB",
		};
		var WS_FILE_EXT_LABEL = {
			py: "PY", js: "JS", jsx: "JSX", mjs: "JS", cjs: "JS",
			ts: "TS", tsx: "TSX", java: "JAVA", go: "GO", rs: "RS",
			c: "C", h: "H", cpp: "C++", cc: "C++", hpp: "C++", cs: "C#",
			rb: "RB", php: "PHP", sh: "SH", bash: "SH", zsh: "SH",
			md: "MD", markdown: "MD", mdx: "MDX",
			json: "JSON", yml: "YML", yaml: "YML", toml: "TML", sql: "SQL",
			ini: "INI", conf: "CFG", cfg: "CFG", env: "ENV",
			css: "CSS", scss: "SCSS", less: "LESS",
			html: "HTML", htm: "HTM", xml: "XML", svg: "SVG", vue: "VUE",
			txt: "TXT", log: "LOG", csv: "CSV", lock: "LCK",
		};
		function WSFileIcon(props) {
			var name = (props.name || "").toLowerCase();
			var label = null, fg = null;
			if (WS_FILE_NAME_LABEL[name]) {
				label = WS_FILE_NAME_LABEL[name];
				fg = "#8B9BAA";
			} else {
				var ext = (name.split(".").pop() || "");
				label = WS_FILE_EXT_LABEL[ext] || null;
				fg = WS_FILE_EXT_COLORS[ext] || "var(--dsw-alias-label-tertiary, #888)";
			}
			if (label) {
				return React.createElement("span", { style: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 16, fontSize: 8.5, fontWeight: 700, color: fg, lineHeight: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "-0.02em", whiteSpace: "nowrap" }, title: name }, label);
			}
			return React.createElement("span", { style: { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, color: "var(--dsw-alias-label-tertiary, #888)", opacity: 0.8 }, title: name },
				React.createElement("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
					React.createElement("path", { d: "M4.2 1.8h4.9a1 1 0 0 1 .7.3l1.6 1.6a1 1 0 0 1 .3.7v8.8a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" }),
					React.createElement("path", { d: "M9.7 2.4v1.5a1 1 0 0 0 1 1h1.5", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" }),
				),
			);
		}
		function WSIconFile(props) {
			var color = props.color || "currentColor";
			return React.createElement("svg", { width: props.size || 16, height: props.size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", style: Object.assign({ flex: "none", opacity: 0.7 }, props.style || {}) },
				React.createElement("path", { d: "M4.2 1.8h4.9a1 1 0 0 1 .7.3l1.6 1.6a1 1 0 0 1 .3.7v8.8a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z", stroke: color, strokeWidth: 1.3, strokeLinejoin: "round" }),
				React.createElement("path", { d: "M9.7 2.4v1.5a1 1 0 0 0 1 1h1.5", stroke: color, strokeWidth: 1.3, strokeLinejoin: "round" }),
			);
		}
		// 2026-08-21 myf: git 分支图标改用标准 octicon git-branch（fill 模式），
		// 避免旧三圆点图标在 chip 内视觉不居中（line-height 基线偏差）。
		function WSIconGit(props) {
			return React.createElement("svg", { width: props.size || 12, height: props.size || 12, viewBox: "0 0 16 16", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", style: Object.assign({ flex: "none", display: "block" }, props.style || {}) },
				React.createElement("path", { d: "M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" }),
			);
		}
		function WSIconRefresh(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" }),
				React.createElement("path", { d: "M13.5 2.5v2.2h-2.2", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" }),
			);
		}
		// 2026-08-21 myf: 折叠/展开图标（octicon-style），用于 tab 头部操作。
		function WSIconExpand(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", style: { flex: "none", display: "block" } },
				React.createElement("path", { d: "M3.75 6.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z", fill: "currentColor" }),
				React.createElement("path", { d: "M1.75 2.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Z", fill: "currentColor" }),
			);
		}
		function WSIconCollapse(props) {
			return React.createElement("svg", { width: props.size || 14, height: props.size || 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", style: { flex: "none", display: "block" } },
				React.createElement("path", { d: "M3.75 6.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z", fill: "currentColor" }),
				React.createElement("path", { d: "M4.25 1.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Z", fill: "currentColor" }),
				React.createElement("path", { d: "M4.25 11a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Z", fill: "currentColor" }),
			);
		}
		function WSIconBack(props) {
			return React.createElement("svg", { width: props.size || 15, height: props.size || 15, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
				React.createElement("path", { d: "M10.5 3 5.5 8l5 5", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }),
			);
		}
		// git 状态徽标 -> 颜色 + 单字母标签 + 中文说明（title 提示）
		function wsStatusOf(st) {
			if (st === "A") return { c: "#16a34a", label: "A", title: "新增" };
			if (st === "D") return { c: "#dc2626", label: "D", title: "删除" };
			if (st === "R") return { c: "#2563eb", label: "R", title: "重命名" };
			if (st === "U") return { c: "#9ca3af", label: "U", title: "未跟踪" };
			return { c: "#d97706", label: "M", title: "已修改" }; // M / 其他
		}
		// 把 overview.files（相对路径数组）构造成嵌套树 { name, dirs, files }
		function wsBuildTree(files) {
			var root = { name: "", dirs: {}, files: [] };
			files.forEach(function (rel) {
				var parts = rel.split("/");
				var node = root;
				for (var i = 0; i < parts.length - 1; i++) {
					var d = parts[i];
					if (!node.dirs[d]) node.dirs[d] = { name: d, dirs: {}, files: [] };
					node = node.dirs[d];
				}
				node.files.push(rel);
			});
			return root;
		}
		// 收集树中所有目录路径（用于「全部折叠」）
		function wsAllDirs(node, prefix, out) {
			Object.keys(node.dirs).forEach(function (dname) {
				var dpath = prefix ? prefix + "/" + dname : dname;
				out.push(dpath);
				wsAllDirs(node.dirs[dname], dpath, out);
			});
			return out;
		}
		// ============ 2026-08-21 myf: 语法高亮 + Markdown/JSON 渲染 ============
		// 暗色主题（VS Code Dark+ 风格配色）：
		//   关键字蓝 / 字符串橙 / 注释绿 / 数字浅绿 / 函数黄 / 类型青 / 属性浅蓝
		var WS_HL_COLORS = { kw: "#569cd6", str: "#ce9178", cmt: "#6a9955", num: "#b5cea8", fn: "#dcdcaa", type: "#4ec9b0", prop: "#9cdcfe", op: "#d4d4d4" };
		// 文件路径 -> 高亮语言名（'' = 不处理）
		function wsLangOf(path) {
			var base = (path || "").split("/").pop().toLowerCase();
			var nameMap = {
				"dockerfile": "sh", "makefile": "make", "gemfile": "rb", "rakefile": "rb",
				"package.json": "json", "tsconfig.json": "json", ".eslintrc": "json", "composer.json": "json",
				".gitignore": "ini", ".gitattributes": "ini", ".editorconfig": "ini",
			};
			if (nameMap[base]) return nameMap[base];
			var ext = (base.split(".").pop() || "").toLowerCase();
			if (!ext || ext === base) return "";
			var m = {
				js: "js", mjs: "js", cjs: "js", jsx: "jsx",
				ts: "ts", tsx: "tsx", py: "py", java: "java", go: "go", rs: "rs",
				c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "cs", rb: "rb", php: "php",
				sh: "sh", bash: "sh", zsh: "sh", ksh: "sh",
				yml: "yaml", yaml: "yaml", json: "json", toml: "toml", sql: "sql", ini: "ini", conf: "ini", cfg: "ini", env: "sh",
				css: "css", scss: "scss", less: "css",
				html: "html", htm: "html", xml: "html", svg: "html", vue: "html",
				md: "md", markdown: "md", mdx: "md",
			};
			return m[ext] || "";
		}
		// 语言 -> 关键字 Set（缓存）
		var WS_KW_CACHE = {};
		function wsKeywordSet(lang) {
			if (WS_KW_CACHE[lang]) return WS_KW_CACHE[lang];
			var sets = {
				js: "var let const function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default static get set delete void null undefined true false",
				jsx: "var let const function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default static get set delete void null undefined true false",
				ts: "var let const function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default static get set delete void null undefined true false interface type enum implements private public protected readonly abstract namespace declare as any never unknown",
				tsx: "var let const function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default static get set delete void null undefined true false interface type enum implements private public protected readonly abstract namespace declare as any never unknown",
				py: "def return if elif else for while import from as class try except finally raise with lambda pass break continue global nonlocal yield async await True False None and or not in is del assert",
				java: "public private protected class interface extends implements static final void int long double float boolean char byte short String new return if else for while do switch case break continue try catch finally throw throws import package this super null true false abstract synchronized volatile enum default instanceof",
				go: "package import func var const type struct interface map chan go defer return if else for range switch case break continue select fallthrough default true false nil len cap make new append error string int float64 bool byte rune",
				rs: "fn let mut const struct enum impl trait use mod pub self Self return if else match for while loop break continue unsafe async await move ref type where true false None Some Ok Err",
				c: "int char float double void long short unsigned signed struct union enum typedef static const extern register volatile return if else for while do switch case break continue goto sizeof NULL true false include define",
				cpp: "int char float double void long short unsigned signed struct union enum typedef static const extern register volatile return if else for while do switch case break continue goto sizeof NULL true false include define class namespace public private protected template typename using virtual override friend",
				cs: "public private protected internal class interface struct enum namespace using return if else for while do switch case break continue try catch finally throw new static readonly const abstract virtual override sealed partial async await null true false void int long double float bool string var",
				rb: "def end return if elsif else unless for while do case when begin rescue ensure class module require include attr_reader attr_writer attr_accessor new nil true false self",
				php: "public private protected function return if else elseif for while foreach switch case break continue try catch finally throw new class extends implements namespace use static const null true false echo array",
				sh: "if then else elif fi for while do done case esac function return export local echo exit true false read cd source",
				sql: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ALTER JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AND OR NOT NULL PRIMARY KEY FOREIGN REFERENCES UNIQUE INDEX DEFAULT CASE WHEN THEN ELSE END COUNT SUM AVG MIN MAX AS DISTINCT BETWEEN LIKE IN EXISTS UNION ALL VIEW TRIGGER PROCEDURE INT VARCHAR TEXT DATE DATETIME BOOLEAN",
				yaml: "true false null yes no on off",
				toml: "true false",
				ini: "true false",
				json: "true false null",
			};
			var set = {};
			(sets[lang] || "").split(/\s+/).forEach(function (w) { if (w) set[w] = true; });
			WS_KW_CACHE[lang] = set;
			return set;
		}
		// 语言分组：js 系（// 与 /* */ 注释）、css（/* */）、html（<!-- -->）、
		// hash 注释（py/sh/yaml/toml/ini/make）
		function wsTokenize(src, lang) {
			var tokens = [];
			var n = src.length;
			var i = 0;
			var kws = wsKeywordSet(lang);
			var jsLike = ["js", "jsx", "ts", "tsx", "java", "go", "rs", "c", "cpp", "cs", "rb", "php"].indexOf(lang) >= 0;
			var hashComment = ["py", "sh", "yaml", "toml", "ini", "make"].indexOf(lang) >= 0;
			var isHtml = lang === "html";
			var prevTok = null;
			while (i < n) {
				var ch = src.charAt(i);
				// 空白
				if (/\s/.test(ch)) {
					var m = src.slice(i).match(/^\s+/);
					tokens.push({ t: "ws", v: m[0] });
					i += m[0].length;
					prevTok = null;
					continue;
				}
				// 注释
				if (jsLike && src.startsWith("//", i)) {
					var e = src.indexOf("\n", i);
					var line = src.slice(i, e < 0 ? n : e);
					tokens.push({ t: "cmt", v: line });
					i += line.length;
					prevTok = null;
					continue;
				}
				if ((jsLike || lang === "css") && src.startsWith("/*", i)) {
					var e2 = src.indexOf("*/", i);
					var block = src.slice(i, e2 < 0 ? n : e2 + 2);
					tokens.push({ t: "cmt", v: block });
					i += block.length;
					prevTok = null;
					continue;
				}
				if (isHtml && src.startsWith("<!--", i)) {
					var e4 = src.indexOf("-->", i);
					var hb = src.slice(i, e4 < 0 ? n : e4 + 3);
					tokens.push({ t: "cmt", v: hb });
					i += hb.length;
					prevTok = null;
					continue;
				}
				if (hashComment && ch === "#") {
					var e3 = src.indexOf("\n", i);
					var l3 = src.slice(i, e3 < 0 ? n : e3);
					tokens.push({ t: "cmt", v: l3 });
					i += l3.length;
					prevTok = null;
					continue;
				}
				// 字符串（含转义）
				if (ch === "\"" || ch === "'" || ch === "`") {
					var q = ch, j = i + 1, s = q, esc = false;
					while (j < n) {
						var c = src.charAt(j);
						if (esc) { s += c; esc = false; j++; continue; }
						if (c === "\\") { s += c; esc = true; j++; continue; }
						s += c; j++;
						if (c === q) break;
					}
					var t = "str";
					// JSON：冒号前的字符串 = 键（prop 色）
					if (lang === "json") {
						var after = src.slice(j).replace(/^\s+/, "");
						if (after.charAt(0) === ":") t = "prop";
					}
					tokens.push({ t: t, v: s });
					i = j;
					prevTok = { t: t };
					continue;
				}
				// 数字
				if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src.charAt(i + 1) || ""))) {
					var dm = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(\.\d+)?([eE][+-]?\d+)?)/);
					if (dm) {
						tokens.push({ t: "num", v: dm[0] });
						i += dm[0].length;
						prevTok = { t: "num" };
						continue;
					}
				}
				// 标识符
				if (/[A-Za-z_$]/.test(ch)) {
					var im = src.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
					var word = im[0];
					var nextCh = src.charAt(i + word.length);
					var isType = /^[A-Z]/.test(word);
					var t;
					if (kws[word]) t = "kw";
					else if (prevTok && prevTok.t === "op" && prevTok.v === ".") t = "prop"; // obj.method
					else if (isType) t = "type";
					else if (nextCh === "(") t = "fn"; // foo(
					else t = "id";
					tokens.push({ t: t, v: word });
					i += word.length;
					prevTok = { t: t, v: word };
					continue;
				}
				// 多字符运算符
				var om = src.slice(i).match(/^(===|!==|==|!=|<=|>=|&&|\|\||->|=>|\+\+|--|\+=|-=|\*=|\/=|%=|\?\?|\.\.\.|::)/);
				if (om) {
					tokens.push({ t: "op", v: om[0] });
					i += om[0].length;
					prevTok = { t: "op", v: om[0] };
					continue;
				}
				tokens.push({ t: "op", v: ch });
				i++;
				prevTok = { t: "op", v: ch };
			}
			return tokens;
		}
		// 高亮渲染：把 token 流转成彩色 span
		function WSHighlight(props) {
			var tokens = wsTokenize(props.text || "", props.lang || "");
			return React.createElement("span", null,
				tokens.map(function (tok, i) {
					var c = WS_HL_COLORS[tok.t];
					if (!c) return tok.v;
					return React.createElement("span", { key: i, style: { color: c } }, tok.v);
				}),
			);
		}
		// JSON：先格式化再高亮（解析失败则原样）
		function wsFormatJson(text) {
			try { return JSON.stringify(JSON.parse(text), null, 2); }
			catch (e) { return text; }
		}
		// 行内 markdown：**粗体** / *斜体* / `代码` / [链接](url)
		function WSInline(props) {
			var text = props.text || "";
			var out = [];
			var re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
			var last = 0, m, k = 0;
			while ((m = re.exec(text))) {
				if (m.index > last) out.push(text.slice(last, m.index));
				var tok = m[0];
				if (tok.charAt(0) === "`") {
					out.push(React.createElement("code", { key: k++, style: { background: "rgba(255,255,255,.08)", padding: "1px 4px", borderRadius: 4, fontSize: "0.92em", color: "#ce9178", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }, tok.slice(1, -1)));
				} else if (tok.charAt(0) === "[") {
					var mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
					out.push(React.createElement("a", { key: k++, href: mm[2], target: "_blank", rel: "noreferrer", style: { color: "#4daafc" } }, mm[1]));
				} else if (tok.charAt(0) === "*" && tok.charAt(1) === "*") {
					out.push(React.createElement("strong", { key: k++ }, tok.slice(2, -2)));
				} else {
					out.push(React.createElement("em", { key: k++ }, tok.slice(1, -1)));
				}
				last = m.index + tok.length;
			}
			if (last < text.length) out.push(text.slice(last));
			return React.createElement("span", null, out);
		}
		// markdown 渲染：标题 / 列表 / 引用 / 代码块（带语法高亮）/ 表格 / 分隔线
		function WSMarkdown(props) {
			var md = props.text || "";
			var lines = md.split("\n");
			var out = [];
			var i = 0, k = 0;
			var codeLang = "", codeBuf = null;
			var listType = null, listItems = [];
			function flushList() {
				if (listType) {
					out.push(React.createElement(listType === "ul" ? "ul" : "ol", { key: k++, style: { margin: "4px 0 6px", paddingLeft: 20 } },
						listItems.map(function (it, j) { return React.createElement("li", { key: j, style: { margin: "2px 0", lineHeight: 1.6 } }, it); }),
					));
					listType = null;
					listItems = [];
				}
			}
			function pushCode() {
				out.push(React.createElement("pre", { key: k++, style: { margin: "6px 0", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", overflowX: "auto", fontSize: 12, lineHeight: 1.55, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } },
					React.createElement("code", null, React.createElement(WSHighlight, { text: codeBuf.join("\n"), lang: codeLang })),
				));
			}
			while (i < lines.length) {
				var line = lines[i];
				if (codeBuf !== null) {
					if (/^\s*```/.test(line)) { pushCode(); codeBuf = null; }
					else codeBuf.push(line);
					i++;
					continue;
				}
				var cm = line.match(/^\s*```(\w*)/);
				if (cm) { codeLang = cm[1] || ""; codeBuf = []; i++; continue; }
				flushList();
				var hm = line.match(/^(#{1,6})\s+(.*)$/);
				if (hm) {
					var lvl = hm[1].length;
					var fs = [17, 15, 13.5, 12.5, 12, 11.5][lvl - 1];
					out.push(React.createElement("div", { key: k++, style: { margin: "8px 0 4px", fontSize: fs, fontWeight: 600, lineHeight: 1.4, color: "var(--dsw-alias-label-primary, #f9fafb)" } },
						React.createElement(WSInline, { text: hm[2] }),
					));
					i++;
					continue;
				}
				if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
					out.push(React.createElement("div", { key: k++, style: { borderTop: "1px solid rgba(255,255,255,.1)", margin: "8px 0" } }));
					i++;
					continue;
				}
				var qm = line.match(/^\s*>\s?(.*)$/);
				if (qm) {
					out.push(React.createElement("div", { key: k++, style: { margin: "4px 0", padding: "2px 10px", borderLeft: "3px solid rgba(255,255,255,.25)", color: "var(--dsw-alias-label-secondary, #aaa)" } },
						React.createElement(WSInline, { text: qm[1] }),
					));
					i++;
					continue;
				}
				var um = line.match(/^\s*[-*+]\s+(.*)$/);
				if (um) {
					if (listType !== "ul") { flushList(); listType = "ul"; }
					listItems.push(React.createElement(WSInline, { text: um[1] }));
					i++;
					continue;
				}
				var om = line.match(/^\s*\d+[.)]\s+(.*)$/);
				if (om) {
					if (listType !== "ol") { flushList(); listType = "ol"; }
					listItems.push(React.createElement(WSInline, { text: om[1] }));
					i++;
					continue;
				}
				// 表格：| a | b | 头 + |---|---| 分隔 + 数据行
				if (/^\s*\|.+\|/.test(line) && /^\s*\|[\s:|-]+\|/.test(lines[i + 1] || "")) {
					flushList();
					var header = line.split("|").map(function (s) { return s.trim(); }).filter(function (s, idx, arr) { return !(idx === 0 && s === "") && !(idx === arr.length - 1 && s === ""); });
					i += 2;
					var rows = [];
					while (i < lines.length && /^\s*\|.+\|/.test(lines[i])) {
						if (/^\s*\|[\s:|-]+\|/.test(lines[i])) { i++; continue; }
						rows.push(lines[i].split("|").map(function (s) { return s.trim(); }).filter(function (s, idx, arr) { return !(idx === 0 && s === "") && !(idx === arr.length - 1 && s === ""); }));
						i++;
					}
					out.push(React.createElement("table", { key: k++, style: { margin: "6px 0", borderCollapse: "collapse", fontSize: 12 } },
						React.createElement("thead", null, React.createElement("tr", null,
							header.map(function (h, j) { return React.createElement("th", { key: j, style: { border: "1px solid rgba(255,255,255,.18)", padding: "4px 8px", fontWeight: 600, textAlign: "left" } }, React.createElement(WSInline, { text: h })); }),
						)),
						React.createElement("tbody", null,
							rows.map(function (row, ri) {
								return React.createElement("tr", { key: ri },
									row.map(function (c, ci) { return React.createElement("td", { key: ci, style: { border: "1px solid rgba(255,255,255,.18)", padding: "3px 8px" } }, React.createElement(WSInline, { text: c })); }),
								);
							}),
						),
					));
					continue;
				}
				if (!line.trim()) { i++; continue; }
				out.push(React.createElement("p", { key: k++, style: { margin: "4px 0", lineHeight: 1.65 } },
					React.createElement(WSInline, { text: line }),
				));
				i++;
			}
			flushList();
			if (codeBuf !== null) pushCode();
			return React.createElement("div", null, out);
		}
		// 2026-08-21 myf: unified diff —— 单列 + 绿增/红减/+ 同背景，行号使用
		// old/new 双列。行级 diff 用内联 jsdiff 5.2.0（Myers 算法，
		// react-diff-viewer / VS Code / git 同引擎）计算。浏览器端 require
		// 只认 seed 表，第三方包必须自包含内联（见下方
		// __RWS_JSDIFF_INLINE__ 注入块）。后端 /research-workspace/diff
		// 返回 { oldText, newText, isBinary }。默认折叠连续 ≥3 行的 same
		// 区段为“…N unchanged lines…”间隔，可点击展开 —— 避免变更行被上
		// 下文淹没（GitHub unified / VS Code 默认行为）。变更上下文 2 行始终
		// 展开。
		function WSDiffView(props) {
			var oldText = props.oldText || "";
			var newText = props.newText || "";
			var openRef = React.useState({});
			var openMap = openRef[0]; var setOpenMap = openRef[1];
			if (props.isBinary) {
				return React.createElement("p", { style: Object.assign({}, S.empty, { color: "var(--dsw-alias-label-secondary, #999)" }) }, "二进制文件，不显示 diff");
			}
			var parts = [];
			try { parts = rwsDiffApi.diffLines(oldText, newText); } catch (e) { parts = []; }
			// 块 -> 行序列：del/add 展开为单行 ×N，same 整段压缩为一块。
			// 视图行 = {kind: 'add'|'del'|'same'|'ctx', text, oldNo, newNo}
			var oldNo = 0, newNo = 0, rows = [];
			parts.forEach(function (p) {
				var lines = p.value.split("\n");
				if (lines.length && lines[lines.length - 1] === "") lines.pop();
				if (p.added) {
					lines.forEach(function (ln) { newNo++; rows.push({ kind: "add", text: ln, oldNo: null, newNo: newNo }); });
				} else if (p.removed) {
					lines.forEach(function (ln) { oldNo++; rows.push({ kind: "del", text: ln, oldNo: oldNo, newNo: null }); });
				} else {
					lines.forEach(function (ln) { oldNo++; newNo++; rows.push({ kind: "same", text: ln, oldNo: oldNo, newNo: newNo }); });
				}
			});
			var CONTEXT = 2; var MIN_COLLAPSE = 3;
			var segs = [];
			var i2 = 0;
			while (i2 < rows.length) {
				if (rows[i2].kind === "same") {
					var j2 = i2;
					while (j2 < rows.length && rows[j2].kind === "same") j2++;
					segs.push({ kind: "same", rows: rows.slice(i2, j2) });
					i2 = j2;
				} else {
					var j3 = i2;
					while (j3 < rows.length && rows[j3].kind !== "same") j3++;
					segs.push({ kind: "chg", rows: rows.slice(i2, j3) });
					i2 = j3;
				}
			}
			var mono = "var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)";
			var noCellBase = { padding: "0 8px", fontFamily: mono, fontSize: 12, lineHeight: 1.5, verticalAlign: "top", color: "var(--dsw-alias-label-tertiary, #888)", textAlign: "right", userSelect: "none", borderRight: "1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08))" };
			var cellBase = { padding: "0 8px", fontFamily: mono, fontSize: 12, lineHeight: 1.5, verticalAlign: "top", whiteSpace: "pre" };
			var sigCellBase = { padding: "0 4px", fontFamily: mono, fontSize: 12, lineHeight: 1.5, verticalAlign: "top", textAlign: "center", userSelect: "none", color: "var(--dsw-alias-label-tertiary, #888)" };
			var bgSame = "var(--dsw-alias-bg-layer-2, #1f1f23)";
			var bgDel = "rgba(220,38,38,.14)";
			var bgAdd = "rgba(22,163,74,.14)";
			var fgDel = "#fca5a5";
			var fgAdd = "#86efac";
			var fgDef = "var(--dsw-alias-label-primary, #e6e6e6)";
			function renderRow(r, key) {
				var isDel = r.kind === "del";
				var isAdd = r.kind === "add";
				var sig = isDel ? "−" : isAdd ? "+" : " ";
				var sigColor = isDel ? fgDel : isAdd ? fgAdd : "var(--dsw-alias-label-tertiary, #888)";
				var bg = isDel ? bgDel : isAdd ? bgAdd : bgSame;
				var fg = isDel ? fgDel : isAdd ? fgAdd : fgDef;
				return React.createElement("tr", { key: key },
					React.createElement("td", { style: Object.assign({}, noCellBase, { background: bg, width: 44 }) }, r.oldNo != null ? r.oldNo : ""),
					React.createElement("td", { style: Object.assign({}, noCellBase, { background: bg, width: 44 }) }, r.newNo != null ? r.newNo : ""),
					React.createElement("td", { style: Object.assign({}, sigCellBase, { background: bg, color: sigColor, width: 18 }) }, sig),
					React.createElement("td", { style: Object.assign({}, cellBase, { background: bg, color: fg }) }, r.text || "\u00a0"),
				);
			}
			// 合并：chg 区段上下各取 CONTEXT 行 same 作为上下文，剩余 same 折叠。
			var out = []; var rowKey = 0;
			for (var s = 0; s < segs.length; s++) {
				var seg = segs[s];
				if (seg.kind === "chg") {
					seg.rows.forEach(function (r) { out.push(renderRow(r, "r" + (rowKey++))); });
					continue;
				}
				var sameStart = seg.rows[0].oldNo;
				var sameEnd = seg.rows[seg.rows.length - 1].oldNo;
				// 总是展开文件首 CONTEXT 行（便于看 header）
				var leadingSame = s === 0 ? CONTEXT : 0;
				// 总是展开文件末尾 CONTEXT 行
				var trailingSame = s === segs.length - 1 ? CONTEXT : 0;
				var head = seg.rows.slice(0, leadingSame);
				var tail = seg.rows.slice(seg.rows.length - trailingSame);
				var mid = seg.rows.slice(leadingSame, seg.rows.length - trailingSame);
				head.forEach(function (r) { out.push(renderRow(r, "r" + (rowKey++))); });
				if (mid.length >= MIN_COLLAPSE) {
					var collapseKey = "s" + s;
					if (openMap[collapseKey]) {
						mid.forEach(function (r) { out.push(renderRow(r, "r" + (rowKey++))); });
					} else {
						var label = "… " + mid.length + " unchanged lines" + (sameStart != null ? "  (L" + sameStart + "–L" + sameEnd + ")" : "") + "  — click to expand";
						out.push(
							React.createElement("tr", { key: collapseKey, onClick: function () { var m = Object.assign({}, openMap); m[collapseKey] = true; setOpenMap(m); }, style: { cursor: "pointer" } },
								React.createElement("td", { colSpan: 4, style: { textAlign: "center", padding: "6px 0", color: "var(--dsw-alias-label-secondary, #aaa)", fontSize: 11, background: "var(--dsw-alias-bg-layer-1, #161618)", borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.1))", borderBottom: "1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.1))" } }, label),
							),
						);
					}
				} else {
					mid.forEach(function (r) { out.push(renderRow(r, "r" + (rowKey++))); });
				}
				tail.forEach(function (r) { out.push(renderRow(r, "r" + (rowKey++))); });
			}
			return React.createElement("div", { style: { overflowX: "auto", border: "1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08))", borderRadius: 6 } },
				React.createElement("table", { style: { borderCollapse: "collapse", width: "100%", tableLayout: "auto" } },
					React.createElement("tbody", null, out),
				),
			);
		}
		// 2026-08-21 myf: jsdiff 5.2.0 内联（npm 包名 diff，Myers 行级 diff 引擎，
// react-diff-viewer / VS Code 同源）。浏览器端 require 不解析 node_modules，
// 第三方依赖必须自包含内联 —— 此处为 diff.min.js 的 UMD 工厂体，经包装后
// 挂到 rwsDiffApi（diffLines/diffChars/… 全量 API）。升级方式：
// npm pack diff@<ver> && 取 dist/diff.min.js 工厂体重新注入。
var rwsDiffApi = {};
(function (e) {"use strict";function t(){}t.prototype={diff:function(s,a,e){var n,t=2<arguments.length&&void 0!==e?e:{},r=t.callback;"function"==typeof t&&(r=t,t={}),this.options=t;var u=this;function d(e){return r?(setTimeout(function(){r(void 0,e)},0),!0):e}s=this.castInput(s),a=this.castInput(a),s=this.removeEmpty(this.tokenize(s));var f=(a=this.removeEmpty(this.tokenize(a))).length,c=s.length,p=1,i=f+c;t.maxEditLength&&(i=Math.min(i,t.maxEditLength));var o=null!==(n=t.timeout)&&void 0!==n?n:1/0,l=Date.now()+o,h=[{oldPos:-1,lastComponent:void 0}],v=this.extractCommon(h[0],a,s,0);if(h[0].oldPos+1>=c&&f<=v+1)return d([{value:this.join(a),count:a.length}]);var m=-1/0,g=1/0;function w(){for(var e=Math.max(m,-p);e<=Math.min(g,p);e+=2){var n=void 0,t=h[e-1],r=h[e+1];t&&(h[e-1]=void 0);var i,o=!1;r&&(i=r.oldPos-e,o=r&&0<=i&&i<f);var l=t&&t.oldPos+1<c;if(o||l){if(n=!l||o&&t.oldPos+1<r.oldPos?u.addToPath(r,!0,void 0,0):u.addToPath(t,void 0,!0,1),v=u.extractCommon(n,a,s,e),n.oldPos+1>=c&&f<=v+1)return d(function(e,n,t,r,i){var o,l=[];for(;n;)l.push(n),o=n.previousComponent,delete n.previousComponent,n=o;l.reverse();for(var s=0,a=l.length,u=0,d=0;s<a;s++){var f,c,p=l[s];p.removed?(p.value=e.join(r.slice(d,d+p.count)),d+=p.count,s&&l[s-1].added&&(f=l[s-1],l[s-1]=l[s],l[s]=f)):(!p.added&&i?(c=(c=t.slice(u,u+p.count)).map(function(e,n){var t=r[d+n];return t.length>e.length?t:e}),p.value=e.join(c)):p.value=e.join(t.slice(u,u+p.count)),u+=p.count,p.added||(d+=p.count))}var h=l[a-1];1<a&&"string"==typeof h.value&&(h.added||h.removed)&&e.equals("",h.value)&&(l[a-2].value+=h.value,l.pop());return l}(u,n.lastComponent,a,s,u.useLongestToken));(h[e]=n).oldPos+1>=c&&(g=Math.min(g,e-1)),f<=v+1&&(m=Math.max(m,e+1))}else h[e]=void 0}p++}if(r)!function e(){setTimeout(function(){return i<p||Date.now()>l?r():void(w()||e())},0)}();else for(;p<=i&&Date.now()<=l;){var y=w();if(y)return y}},addToPath:function(e,n,t,r){var i=e.lastComponent;return i&&i.added===n&&i.removed===t?{oldPos:e.oldPos+r,lastComponent:{count:i.count+1,added:n,removed:t,previousComponent:i.previousComponent}}:{oldPos:e.oldPos+r,lastComponent:{count:1,added:n,removed:t,previousComponent:i}}},extractCommon:function(e,n,t,r){for(var i=n.length,o=t.length,l=e.oldPos,s=l-r,a=0;s+1<i&&l+1<o&&this.equals(n[s+1],t[l+1]);)s++,l++,a++;return a&&(e.lastComponent={count:a,previousComponent:e.lastComponent}),e.oldPos=l,s},equals:function(e,n){return this.options.comparator?this.options.comparator(e,n):e===n||this.options.ignoreCase&&e.toLowerCase()===n.toLowerCase()},removeEmpty:function(e){for(var n=[],t=0;t<e.length;t++)e[t]&&n.push(e[t]);return n},castInput:function(e){return e},tokenize:function(e){return e.split("")},join:function(e){return e.join("")}};var r=new t;function i(e,n){if("function"==typeof e)n.callback=e;else if(e)for(var t in e)e.hasOwnProperty(t)&&(n[t]=e[t]);return n}var o=/^[A-Za-z\xC0-\u02C6\u02C8-\u02D7\u02DE-\u02FF\u1E00-\u1EFF]+$/,l=/\S/,s=new t;s.equals=function(e,n){return this.options.ignoreCase&&(e=e.toLowerCase(),n=n.toLowerCase()),e===n||this.options.ignoreWhitespace&&!l.test(e)&&!l.test(n)},s.tokenize=function(e){for(var n=e.split(/([^\S\r\n]+|[()[\]{}'"\r\n]|\b)/),t=0;t<n.length-1;t++)!n[t+1]&&n[t+2]&&o.test(n[t])&&o.test(n[t+2])&&(n[t]+=n[t+2],n.splice(t+1,2),t--);return n};var a=new t;function L(e,n,t){return a.diff(e,n,t)}a.tokenize=function(e){this.options.stripTrailingCr&&(e=e.replace(/\r\n/g,"\n"));var n=[],t=e.split(/(\n|\r\n)/);t[t.length-1]||t.pop();for(var r=0;r<t.length;r++){var i=t[r];r%2&&!this.options.newlineIsToken?n[n.length-1]+=i:(this.options.ignoreWhitespace&&(i=i.trim()),n.push(i))}return n};var u=new t;u.tokenize=function(e){return e.split(/(\S.+?[.!?])(?=\s+|$)/)};var d=new t;function f(e){return(f="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e})(e)}function n(n,e){var t,r=Object.keys(n);return Object.getOwnPropertySymbols&&(t=Object.getOwnPropertySymbols(n),e&&(t=t.filter(function(e){return Object.getOwnPropertyDescriptor(n,e).enumerable})),r.push.apply(r,t)),r}function c(i){for(var e=1;e<arguments.length;e++){var o=null!=arguments[e]?arguments[e]:{};e%2?n(Object(o),!0).forEach(function(e){var n,t,r;n=i,r=o[t=e],t in n?Object.defineProperty(n,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):n[t]=r}):Object.getOwnPropertyDescriptors?Object.defineProperties(i,Object.getOwnPropertyDescriptors(o)):n(Object(o)).forEach(function(e){Object.defineProperty(i,e,Object.getOwnPropertyDescriptor(o,e))})}return i}function x(e){return function(e){if(Array.isArray(e))return p(e)}(e)||function(e){if("undefined"!=typeof Symbol&&Symbol.iterator in Object(e))return Array.from(e)}(e)||function(e,n){if(!e)return;if("string"==typeof e)return p(e,n);var t=Object.prototype.toString.call(e).slice(8,-1);"Object"===t&&e.constructor&&(t=e.constructor.name);if("Map"===t||"Set"===t)return Array.from(e);if("Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))return p(e,n)}(e)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function p(e,n){(null==n||n>e.length)&&(n=e.length);for(var t=0,r=new Array(n);t<n;t++)r[t]=e[t];return r}d.tokenize=function(e){return e.split(/([{}:;,]|\s+)/)};var h=Object.prototype.toString,v=new t;function m(e,n,t,r,i){var o,l;for(n=n||[],t=t||[],r&&(e=r(i,e)),o=0;o<n.length;o+=1)if(n[o]===e)return t[o];if("[object Array]"===h.call(e)){for(n.push(e),l=new Array(e.length),t.push(l),o=0;o<e.length;o+=1)l[o]=m(e[o],n,t,r,i);return n.pop(),t.pop(),l}if(e&&e.toJSON&&(e=e.toJSON()),"object"===f(e)&&null!==e){n.push(e),l={},t.push(l);var s,a=[];for(s in e)e.hasOwnProperty(s)&&a.push(s);for(a.sort(),o=0;o<a.length;o+=1)l[s=a[o]]=m(e[s],n,t,r,s);n.pop(),t.pop()}else l=e;return l}v.useLongestToken=!0,v.tokenize=a.tokenize,v.castInput=function(e){var n=this.options,t=n.undefinedReplacement,r=n.stringifyReplacer,i=void 0===r?function(e,n){return void 0===n?t:n}:r;return"string"==typeof e?e:JSON.stringify(m(e,null,null,i),i,"  ")},v.equals=function(e,n){return t.prototype.equals.call(v,e.replace(/,([\r\n])/g,"$1"),n.replace(/,([\r\n])/g,"$1"))};var g=new t;function C(e){var l=1<arguments.length&&void 0!==arguments[1]?arguments[1]:{},s=e.split(/\r\n|[\n\v\f\r\x85]/),a=e.match(/\r\n|[\n\v\f\r\x85]/g)||[],i=[],u=0;function n(){var e={};for(i.push(e);u<s.length;){var n=s[u];if(/^(\-\-\-|\+\+\+|@@)\s/.test(n))break;var t=/^(?:Index:|diff(?: -r \w+)+)\s+(.+?)\s*$/.exec(n);t&&(e.index=t[1]),u++}for(o(e),o(e),e.hunks=[];u<s.length;){var r=s[u];if(/^(Index:|diff|\-\-\-|\+\+\+)\s/.test(r))break;if(/^@@/.test(r))e.hunks.push(function(){var e=u,n=s[u++].split(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/),t={oldStart:+n[1],oldLines:void 0===n[2]?1:+n[2],newStart:+n[3],newLines:void 0===n[4]?1:+n[4],lines:[],linedelimiters:[]};0===t.oldLines&&(t.oldStart+=1);0===t.newLines&&(t.newStart+=1);for(var r=0,i=0;u<s.length&&!(0===s[u].indexOf("--- ")&&u+2<s.length&&0===s[u+1].indexOf("+++ ")&&0===s[u+2].indexOf("@@"));u++){var o=0==s[u].length&&u!=s.length-1?" ":s[u][0];if("+"!==o&&"-"!==o&&" "!==o&&"\\"!==o)break;t.lines.push(s[u]),t.linedelimiters.push(a[u]||"\n"),"+"===o?r++:"-"===o?i++:" "===o&&(r++,i++)}r||1!==t.newLines||(t.newLines=0);i||1!==t.oldLines||(t.oldLines=0);if(l.strict){if(r!==t.newLines)throw new Error("Added line count did not match for hunk at line "+(e+1));if(i!==t.oldLines)throw new Error("Removed line count did not match for hunk at line "+(e+1))}return t}());else{if(r&&l.strict)throw new Error("Unknown line "+(u+1)+" "+JSON.stringify(r));u++}}}function o(e){var n,t,r,i=/^(---|\+\+\+)\s+(.*)$/.exec(s[u]);i&&(n="---"===i[1]?"old":"new",r=(t=i[2].split("\t",2))[0].replace(/\\\\/g,"\\"),/^".*"$/.test(r)&&(r=r.substr(1,r.length-2)),e[n+"FileName"]=r,e[n+"Header"]=(t[1]||"").trim(),u++)}for(;u<s.length;)n();return i}function w(e,n){var t=2<arguments.length&&void 0!==arguments[2]?arguments[2]:{};if("string"==typeof n&&(n=C(n)),Array.isArray(n)){if(1<n.length)throw new Error("applyPatch only works with a single input.");n=n[0]}var r,i,l=e.split(/\r\n|[\n\v\f\r\x85]/),o=e.match(/\r\n|[\n\v\f\r\x85]/g)||[],s=n.hunks,a=t.compareLine||function(e,n,t,r){return n===r},u=0,d=t.fuzzFactor||0,f=0,c=0;for(var p=0;p<s.length;p++){for(var h=s[p],v=l.length-h.oldLines,m=0,g=c+h.oldStart-1,w=function(n,t,r){var i=!0,o=!1,l=!1,s=1;return function e(){if(i&&!l){if(o?s++:i=!1,n+s<=r)return s;l=!0}if(!o)return l||(i=!0),t<=n-s?-s++:(o=!0,e())}}(g,f,v);void 0!==m;m=w())if(function(e,n){for(var t=0;t<e.lines.length;t++){var r=e.lines[t],i=0<r.length?r[0]:" ",o=0<r.length?r.substr(1):r;if(" "===i||"-"===i){if(!a(n+1,l[n],i,o)&&d<++u)return;n++}}return 1}(h,g+m)){h.offset=c+=m;break}if(void 0===m)return!1;f=h.offset+h.oldStart+h.oldLines}for(var y=0,L=0;L<s.length;L++){var x=s[L],S=x.oldStart+x.offset+y-1;y+=x.newLines-x.oldLines;for(var b=0;b<x.lines.length;b++){var k,F=x.lines[b],N=0<F.length?F[0]:" ",P=0<F.length?F.substr(1):F,j=x.linedelimiters&&x.linedelimiters[b]||"\n";" "===N?S++:"-"===N?(l.splice(S,1),o.splice(S,1)):"+"===N?(l.splice(S,0,P),o.splice(S,0,j),S++):"\\"===N&&("+"===(k=x.lines[b-1]?x.lines[b-1][0]:null)?r=!0:"-"===k&&(i=!0))}}if(r)for(;!l[l.length-1];)l.pop(),o.pop();else i&&(l.push(""),o.push("\n"));for(var O=0;O<l.length-1;O++)l[O]=l[O]+o[O];return l.join("")}function y(e,n,u,d,t,r,f){void 0===(f=f||{}).context&&(f.context=4);var c=L(u,d,f);if(c){c.push({value:"",lines:[]});for(var p=[],h=0,v=0,m=[],g=1,w=1,i=0;i<c.length;i++)!function(e){var n,t,r,i,o,l,s=c[e],a=s.lines||s.value.replace(/\n$/,"").split("\n");s.lines=a,s.added||s.removed?(h||(n=c[e-1],h=g,v=w,n&&(m=0<f.context?y(n.lines.slice(-f.context)):[],h-=m.length,v-=m.length)),m.push.apply(m,x(a.map(function(e){return(s.added?"+":"-")+e}))),s.added?w+=a.length:g+=a.length):(h&&(a.length<=2*f.context&&e<c.length-2?m.push.apply(m,x(y(a))):(t=Math.min(a.length,f.context),m.push.apply(m,x(y(a.slice(0,t)))),r={oldStart:h,oldLines:g-h+t,newStart:v,newLines:w-v+t,lines:m},e>=c.length-2&&a.length<=f.context&&(i=/\n$/.test(u),o=/\n$/.test(d),l=0==a.length&&m.length>r.oldLines,!i&&l&&0<u.length&&m.splice(r.oldLines,0,"\\ No newline at end of file"),(i||l)&&o||m.push("\\ No newline at end of file")),p.push(r),v=h=0,m=[])),g+=a.length,w+=a.length)}(i);return{oldFileName:e,newFileName:n,oldHeader:t,newHeader:r,hunks:p}}function y(e){return e.map(function(e){return" "+e})}}function S(e){if(Array.isArray(e))return e.map(S).join("\n");var n=[];e.oldFileName==e.newFileName&&n.push("Index: "+e.oldFileName),n.push("==================================================================="),n.push("--- "+e.oldFileName+(void 0===e.oldHeader?"":"\t"+e.oldHeader)),n.push("+++ "+e.newFileName+(void 0===e.newHeader?"":"\t"+e.newHeader));for(var t=0;t<e.hunks.length;t++){var r=e.hunks[t];0===r.oldLines&&--r.oldStart,0===r.newLines&&--r.newStart,n.push("@@ -"+r.oldStart+","+r.oldLines+" +"+r.newStart+","+r.newLines+" @@"),n.push.apply(n,r.lines)}return n.join("\n")+"\n"}function b(e,n,t,r,i,o,l){return S(y(e,n,t,r,i,o,l))}function k(e,n){if(n.length>e.length)return!1;for(var t=0;t<n.length;t++)if(n[t]!==e[t])return!1;return!0}function F(e){var n=function r(e){var i=0;var o=0;e.forEach(function(e){var n,t;"string"!=typeof e?(n=r(e.mine),t=r(e.theirs),void 0!==i&&(n.oldLines===t.oldLines?i+=n.oldLines:i=void 0),void 0!==o&&(n.newLines===t.newLines?o+=n.newLines:o=void 0)):(void 0===o||"+"!==e[0]&&" "!==e[0]||o++,void 0===i||"-"!==e[0]&&" "!==e[0]||i++)});return{oldLines:i,newLines:o}}(e.lines),t=n.oldLines,r=n.newLines;void 0!==t?e.oldLines=t:delete e.oldLines,void 0!==r?e.newLines=r:delete e.newLines}function N(e,n){if("string"!=typeof e)return e;if(/^@@/m.test(e)||/^Index:/m.test(e))return C(e)[0];if(!n)throw new Error("Must provide a base reference or pass in a patch");return y(void 0,void 0,n,e)}function P(e){return e.newFileName&&e.newFileName!==e.oldFileName}function j(e,n,t){return n===t?n:(e.conflict=!0,{mine:n,theirs:t})}function O(e,n){return e.oldStart<n.oldStart&&e.oldStart+e.oldLines<n.oldStart}function H(e,n){return{oldStart:e.oldStart,oldLines:e.oldLines,newStart:e.newStart+n,newLines:e.newLines,lines:e.lines}}function A(e,n,t,r){var i,o=M(n),l=function(e,n){var t=[],r=[],i=0,o=!1,l=!1;for(;i<n.length&&e.index<e.lines.length;){var s=e.lines[e.index],a=n[i];if("+"===a[0])break;if(o=o||" "!==s[0],r.push(a),i++,"+"===s[0])for(l=!0;"+"===s[0];)t.push(s),s=e.lines[++e.index];a.substr(1)===s.substr(1)?(t.push(s),e.index++):l=!0}"+"===(n[i]||"")[0]&&o&&(l=!0);if(l)return t;for(;i<n.length;)r.push(n[i++]);return{merged:r,changes:t}}(t,o);l.merged?(i=e.lines).push.apply(i,x(l.merged)):E(e,r?l:o,r?o:l)}function E(e,n,t){e.conflict=!0,e.lines.push({conflict:!0,mine:n,theirs:t})}function z(e,n,t){for(;n.offset<t.offset&&n.index<n.lines.length;){var r=n.lines[n.index++];e.lines.push(r),n.offset++}}function T(e,n){for(;n.index<n.lines.length;){var t=n.lines[n.index++];e.lines.push(t)}}function M(e){for(var n=[],t=e.lines[e.index][0];e.index<e.lines.length;){var r=e.lines[e.index];if("-"===t&&"+"===r[0]&&(t="+"),t!==r[0])break;n.push(r),e.index++}return n}function D(e){return e.reduce(function(e,n){return e&&"-"===n[0]},!0)}function I(e,n,t){for(var r=0;r<t;r++){var i=n[n.length-t+r].substr(1);if(e.lines[e.index+r]!==" "+i)return}return e.index+=t,1}g.tokenize=function(e){return e.slice()},g.join=g.removeEmpty=function(e){return e},e.Diff=t,e.applyPatch=w,e.applyPatches=function(e,o){"string"==typeof e&&(e=C(e));var n=0;!function r(){var i=e[n++];if(!i)return o.complete();o.loadFile(i,function(e,n){if(e)return o.complete(e);var t=w(n,i,o);o.patched(i,t,function(e){return e?o.complete(e):void r()})})}()},e.canonicalize=m,e.convertChangesToDMP=function(e){for(var n,t,r=[],i=0;i<e.length;i++)t=(n=e[i]).added?1:n.removed?-1:0,r.push([t,n.value]);return r},e.convertChangesToXML=function(e){for(var n,t=[],r=0;r<e.length;r++){var i=e[r];i.added?t.push("<ins>"):i.removed&&t.push("<del>"),t.push((n=i.value,n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"))),i.added?t.push("</ins>"):i.removed&&t.push("</del>")}return t.join("")},e.createPatch=function(e,n,t,r,i,o){return b(e,e,n,t,r,i,o)},e.createTwoFilesPatch=b,e.diffArrays=function(e,n,t){return g.diff(e,n,t)},e.diffChars=function(e,n,t){return r.diff(e,n,t)},e.diffCss=function(e,n,t){return d.diff(e,n,t)},e.diffJson=function(e,n,t){return v.diff(e,n,t)},e.diffLines=L,e.diffSentences=function(e,n,t){return u.diff(e,n,t)},e.diffTrimmedLines=function(e,n,t){var r=i(t,{ignoreWhitespace:!0});return a.diff(e,n,r)},e.diffWords=function(e,n,t){return t=i(t,{ignoreWhitespace:!0}),s.diff(e,n,t)},e.diffWordsWithSpace=function(e,n,t){return s.diff(e,n,t)},e.formatPatch=S,e.merge=function(e,n,t){e=N(e,t),n=N(n,t);var r={};(e.index||n.index)&&(r.index=e.index||n.index),(e.newFileName||n.newFileName)&&(P(e)?P(n)?(r.oldFileName=j(r,e.oldFileName,n.oldFileName),r.newFileName=j(r,e.newFileName,n.newFileName),r.oldHeader=j(r,e.oldHeader,n.oldHeader),r.newHeader=j(r,e.newHeader,n.newHeader)):(r.oldFileName=e.oldFileName,r.newFileName=e.newFileName,r.oldHeader=e.oldHeader,r.newHeader=e.newHeader):(r.oldFileName=n.oldFileName||e.oldFileName,r.newFileName=n.newFileName||e.newFileName,r.oldHeader=n.oldHeader||e.oldHeader,r.newHeader=n.newHeader||e.newHeader)),r.hunks=[];for(var i=0,o=0,l=0,s=0;i<e.hunks.length||o<n.hunks.length;){var a,u=e.hunks[i]||{oldStart:1/0},d=n.hunks[o]||{oldStart:1/0};O(u,d)?(r.hunks.push(H(u,l)),i++,s+=u.newLines-u.oldLines):O(d,u)?(r.hunks.push(H(d,s)),o++,l+=d.newLines-d.oldLines):(function(e,n,t,r,i){var o,l,s={offset:n,lines:t,index:0},a={offset:r,lines:i,index:0};z(e,s,a),z(e,a,s);for(;s.index<s.lines.length&&a.index<a.lines.length;){var u=s.lines[s.index],d=a.lines[a.index];"-"!==u[0]&&"+"!==u[0]||"-"!==d[0]&&"+"!==d[0]?"+"===u[0]&&" "===d[0]?(o=e.lines).push.apply(o,x(M(s))):"+"===d[0]&&" "===u[0]?(l=e.lines).push.apply(l,x(M(a))):"-"===u[0]&&" "===d[0]?A(e,s,a):"-"===d[0]&&" "===u[0]?A(e,a,s,!0):u===d?(e.lines.push(u),s.index++,a.index++):E(e,M(s),M(a)):function(e,n,t){var r,i,o,l=M(n),s=M(t);if(D(l)&&D(s)){if(k(l,s)&&I(t,l,l.length-s.length))return(r=e.lines).push.apply(r,x(l));if(k(s,l)&&I(n,s,s.length-l.length))return(i=e.lines).push.apply(i,x(s))}else if(function(e,n){return e.length===n.length&&k(e,n)}(l,s))return(o=e.lines).push.apply(o,x(l));E(e,l,s)}(e,s,a)}T(e,s),T(e,a),F(e)}(a={oldStart:Math.min(u.oldStart,d.oldStart),oldLines:0,newStart:Math.min(u.newStart+l,d.oldStart+s),newLines:0,lines:[]},u.oldStart,u.lines,d.oldStart,d.lines),o++,i++,r.hunks.push(a))}return r},e.parsePatch=C,e.reversePatch=function e(n){return Array.isArray(n)?n.map(e).reverse():c(c({},n),{},{oldFileName:n.newFileName,oldHeader:n.newHeader,newFileName:n.oldFileName,newHeader:n.oldHeader,hunks:n.hunks.map(function(e){return{oldLines:e.newLines,oldStart:e.newStart,newLines:e.oldLines,newStart:e.oldStart,linedelimiters:e.linedelimiters,lines:e.lines.map(function(e){return e.startsWith("-")?"+".concat(e.slice(1)):e.startsWith("+")?"-".concat(e.slice(1)):e})}})})},e.structuredPatch=y}(rwsDiffApi));

		function WorkspacePanel() {
			// 2026-08-20 myf: 变更树 + diff 视图（文件区已移除）。变更文件按目录
			// 树形分组（知道是哪个文件夹下的变动），点击文件查看代码 diff；
			// 头部「全部展开/折叠」按钮，默认折叠。
			var [data, setData] = useState(null); // { root, branch, changes }
			var [err, setErr] = useState("");
			var [loading, setLoading] = useState(false);
			var [collapsed, setCollapsed] = useState({}); // { dirPath: true } 折叠
			var [diff, setDiff] = useState(null); // { path, oldText, newText, isBinary }
			// 2026-08-20 myf: 默认折叠只做一次 —— collapsed 首次为空时把所有目录置
			// 为折叠；用户手动全部展开后 collapsed 变空，不能再触发默认折叠。
			var foldInitRef = useRef(false);
			// 当前绑定的 DSH workspace 根（绝对路径）
			var [activeRoot, setActiveRoot] = useState(null);
			// 2026-08-20 myf: submodule 导航根 —— 点击 submodule 行进入其内部变更树
			//（有效根切到 submodule 路径），头部「返回上级」置回 null 回落外部根。
			// 用独立 navRoot 而非改 activeRoot：避免与 deriveActiveRoot 订阅冲突。
			var [navRoot, setNavRoot] = useState(null);
			var effRoot = navRoot || activeRoot;
			function rootQuery(extra) {
				var sep = extra && extra.indexOf("?") >= 0 ? "&" : "?";
				return effRoot ? sep + "root=" + encodeURIComponent(effRoot) : "";
			}
			function deriveActiveRoot() {
				var wsSnap = rwsWorkspaces && rwsWorkspaces.list ? rwsWorkspaces.list.getSnapshot() : null;
				if (!wsSnap || !wsSnap.items || !wsSnap.items.length) return null;
				var sessSnap = rwsSessions && rwsSessions.list ? rwsSessions.list.getSnapshot() : null;
				if (sessSnap && sessSnap.current !== undefined) {
					var cur = wsSnap.items.find(function (w) { return w.sessionIds.indexOf(sessSnap.current) >= 0; });
					if (cur && cur.path) return cur.path;
				}
				var target = wsSnap.recentWorkspaceId
					? wsSnap.items.find(function (w) { return w.workspaceId === wsSnap.recentWorkspaceId; })
					: null;
				if (!target) target = wsSnap.items[0];
				return target && target.path ? target.path : null;
			}
			useEffect(function () {
				if (!rwsWorkspaces || !rwsWorkspaces.list) return;
				var unsub = rwsWorkspaces.list.subscribe(function () { setActiveRoot(deriveActiveRoot()); });
				var unsub2 = rwsSessions && rwsSessions.list
					? rwsSessions.list.subscribe(function () { setActiveRoot(deriveActiveRoot()); })
					: null;
				setActiveRoot(deriveActiveRoot());
				return function () {
					if (unsub) unsub();
					if (unsub2) unsub2();
				};
			}, []);
			function load() {
				setErr("");
				setLoading(true);
				api("/research-workspace/overview" + rootQuery("")).then(function (j) {
					if (ok(j)) { setData(j.data); setErr(""); }
					else setErr(j.message || "加载失败");
				}).catch(function () { setErr("加载失败"); }).then(function () { setLoading(false); });
			}
			useEffect(function () {
				if (effRoot == null) { setData(null); setErr(""); return; }
				load();
			}, [activeRoot, navRoot]);
			// 根切换时清折叠/diff + 重置默认折叠标记。外部 workspace 切换
			//（activeRoot 变化）时同时清掉 submodule 导航根；进入 submodule 只改
			// navRoot 不改 activeRoot，本 effect 不触发，返回按钮得以保留。
			useEffect(function () {
				setCollapsed({}); setDiff(null); setNavRoot(null); foldInitRef.current = false;
			}, [activeRoot]);
			// 默认折叠（仅首次，按当前 data 的目录树）：放 useEffect 而非 render，
			// 保证 data 已切到目标根（含进入 submodule 后）再折叠 —— 否则旧数据会
			// 先消费 foldInitRef，导致 submodule 内部目录以展开态出现。
			useEffect(function () {
				var changes = data ? (data.changes || []) : [];
				if (!changes.length || foldInitRef.current || Object.keys(collapsed).length > 0) return;
				var tree = wsBuildTree(changes.map(function (c) { return c.path; }));
				var allDirs = wsAllDirs(tree, "", []);
				if (!allDirs.length) return;
				foldInitRef.current = true;
				var init = {};
				allDirs.forEach(function (d) { init[d] = true; });
				setCollapsed(init);
			}, [data]);
			// SSE 实时刷新：收到 change 事件命中当前根时，300ms 防抖重拉 overview；
			// 若当前正打开某文件 diff 也一并重拉。
			var diffRef = useRef(null);
			diffRef.current = diff;
			var refreshRef = useRef(null);
			refreshRef.current = function () {
				load();
				var d = diffRef.current;
				if (d && d.path) openDiff(d.path);
			};
			useEffect(function () {
				var es;
				try { es = new EventSource("/research-workspace/events"); } catch (e) { return; }
				var deb = null;
				var onEvt = function () {
					if (deb) clearTimeout(deb);
					deb = setTimeout(function () {
						deb = null;
						if (refreshRef.current) refreshRef.current();
					}, 300);
				};
				var onMsg = function (ev) {
					var payload = null;
					try { payload = JSON.parse(ev.data); } catch (e) { payload = null; }
					var root = payload && payload.root;
					if (root && activeRoot && root !== activeRoot) return;
					onEvt();
				};
				es.addEventListener("change", onMsg);
				es.onerror = function () { /* EventSource 自动重连 */ };
				return function () {
					if (deb) clearTimeout(deb);
					if (es) es.close();
				};
			}, []);
			// 进入 submodule 内部变更树：有效根切到 submodule 路径。
			// 后端 resolveWorkspaceRoots 已把 submodule 目录加入白名单，root 可命中。
			// 2026-08-20 myf: setData(null) 立即清空旧数据 —— 否则在异步拉取新根
			// overview 期间会用旧根目录树渲染一帧（且 collapsed 已清空=全展开），
			// 造成「先闪根目录再跳 submodule」的视觉跳变。
			function enterSubmodule(rel) {
				if (!effRoot) return;
				setNavRoot(effRoot.replace(/\/+$/, "") + "/" + rel);
				setData(null);
				setCollapsed({});
				setDiff(null);
				foldInitRef.current = false;
			}
			// 返回上级：清 navRoot 回落外部根。同样立即清 data，避免旧 submodule 树闪一帧。
			function backToParent() {
				setNavRoot(null);
				setData(null);
				setCollapsed({});
				setDiff(null);
				foldInitRef.current = false;
			}
			// 打开单文件 diff（/diff 接口返回 oldText/newText/isBinary）
			function openDiff(path) {
				setDiff({ path: path, oldText: "", newText: "", isBinary: false, loading: true });
				api("/research-workspace/diff?path=" + encodeURIComponent(path) + rootQuery("?path=" + encodeURIComponent(path))).then(function (j) {
					if (ok(j)) setDiff({ path: path, oldText: j.data.oldText || "", newText: j.data.newText || "", isBinary: !!j.data.isBinary, loading: false });
					else setDiff({ path: path, oldText: "", newText: "", isBinary: false, loading: false, error: j.message || "读取 diff 失败" });
				}).catch(function () { setDiff({ path: path, oldText: "", newText: "", isBinary: false, loading: false, error: "网络错误" }); });
			}
			function toggleDir(dpath) {
				setCollapsed(function (c) { var n = Object.assign({}, c); n[dpath] = !n[dpath]; return n; });
			}
			// 变更路径 -> 状态；文件集合（submodule 判断）
			var changeMap = {};
			var filesSet = {};
			if (data) {
				(data.changes || []).forEach(function (c) { changeMap[c.path] = c.status; });
				(data.files || []).forEach(function (f) { filesSet[f] = true; });
			}
			function isSubmodulePath(p) { return p.indexOf("/") === -1 && !filesSet[p]; }
			// 目录变更状态（用于目录行徽标）
			function dirStatus(node, changeMap) {
				var hit = null;
				(function walk(n) {
					if (hit) return;
					(n.files || []).forEach(function (rel) { if (changeMap[rel] && !hit) hit = changeMap[rel]; });
					Object.keys(n.dirs || {}).forEach(function (k) { walk(n.dirs[k]); });
				})(node);
				return hit;
			}
			// 递归渲染变更树（目录可折叠，文件点击看 diff）
			function renderNode(node, depth, prefix) {
				if (!node) return null;
				var kids = [];
				Object.keys(node.dirs).sort().forEach(function (dname) {
					var dpath = prefix ? prefix + "/" + dname : dname;
					var isCol = !!collapsed[dpath];
					var dStat = dirStatus(node.dirs[dname], changeMap);
					kids.push(
						React.createElement("div", { key: "d:" + dpath },
							React.createElement("div", {
								className: "dsh-ws-row",
								style: { paddingLeft: 4 + depth * 14 },
								onClick: function () { toggleDir(dpath); },
							},
								React.createElement("span", { style: { flex: "none", display: "inline-flex", width: 14, height: 14, alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary, #888)" } },
									React.createElement(IconChevronRight, { className: "dsh-rr-arrow" + (isCol ? "" : " dsh-rr-open") }),
								),
								isCol ? React.createElement(IconFolderClose, { size: 16, style: { opacity: 0.85 } })
									: React.createElement(IconFolderOpen, { size: 16, style: { opacity: 0.85 } }),
								React.createElement("span", { style: WS_ROW_TITLE }, dname),
								dStat ? React.createElement(WSStatusBadge, { st: dStat }) : null,
							),
							isCol ? null : renderNode(node.dirs[dname], depth + 1, dpath),
						),
					);
				});
				node.files.forEach(function (rel) {
					var name = rel.split("/").pop();
					var st = changeMap[rel];
					var isSub = isSubmodulePath(rel);
					kids.push(
						React.createElement("div", {
							key: "f:" + rel,
							className: "dsh-ws-row",
							style: { paddingLeft: 4 + depth * 14 },
							title: rel,
							onClick: function () { isSub ? enterSubmodule(rel) : openDiff(rel); },
						},
							React.createElement("span", { style: { flex: "none", width: 14 } }),
							isSub
								? React.createElement(IconFolderClose, { size: 16, style: { opacity: 0.85 } })
								: React.createElement(WSFileIcon, { name: name }),
							React.createElement("span", { style: Object.assign({}, WS_ROW_TITLE, { fontWeight: 500 }) }, name),
							isSub ? React.createElement("span", { className: "dsh-ws-chip" }, "submodule")
								: (st ? React.createElement(WSStatusBadge, { st: st }) : null),
						),
					);
				});
				return React.createElement("div", null, kids);
			}
			// 变更树视图：仅显示有 git 变更的文件，按目录分组
			function renderChanges() {
				var changes = data ? (data.changes || []) : [];
				if (!changes.length) return React.createElement("div", { style: { padding: "26px 0", textAlign: "center" } },
					React.createElement("p", { style: Object.assign({}, S.empty, { padding: 0, color: "var(--dsw-alias-label-tertiary, #999)" }) }, "工作区没有变更"),
				);
				var tree = wsBuildTree(changes.map(function (c) { return c.path; }));
				return React.createElement("div", null, renderNode(tree, 0, ""));
			}
			// diff 视图：头部（← 返回 + 路径）+ WSDiffView
			function renderDiff() {
				if (!diff) return null;
				var statusEl = diff.loading
					? React.createElement("p", { style: S.empty }, "加载 diff…")
					: diff.error
					? React.createElement("p", { style: S.err }, diff.error)
					: diff.isBinary
					? React.createElement("p", { style: Object.assign({}, S.empty, { color: "var(--dsw-alias-label-secondary, #999)" }) }, "二进制文件，不显示 diff")
					: React.createElement(WSDiffView, { oldText: diff.oldText, newText: diff.newText, isBinary: false });
				return React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
					React.createElement("div", { className: "dsh-ws-header" },
						React.createElement("button", { type: "button", className: "dsh-ws-iconbtn", title: "返回变更列表", onClick: function () { setDiff(null); } }, React.createElement(WSIconBack, { size: 15 })),
						React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-primary, #f9fafb)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, title: diff.path }, diff.path),
					),
					React.createElement("div", { className: "dsh-ws-scroll" }, statusEl),
				);
			}
			// 头部变量：分支 + 变更数 + 根名 + 全部折叠判定
			var branch = data ? (data.branch || "(no branch)") : "…";
			var nChanges = data ? (data.changes || []).length : 0;
			var rootName = data && data.root ? data.root.split("/").pop() : "";
			var allCollapsed = false;
			var treeDirs = [];
			if (data && (data.changes || []).length) {
				treeDirs = wsAllDirs(wsBuildTree((data.changes || []).map(function (c) { return c.path; })), "", []);
				allCollapsed = treeDirs.length > 0 && treeDirs.every(function (d) { return collapsed[d]; });
			}
			function toggleAll() {
				if (allCollapsed) setCollapsed({});
				else { var c = {}; treeDirs.forEach(function (d) { c[d] = true; }); setCollapsed(c); }
			}
			return React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
				React.createElement("div", { className: "dsh-ws-header" },
						navRoot ? React.createElement("button", { type: "button", className: "dsh-ws-iconbtn", title: "返回上级目录", onClick: backToParent }, React.createElement(WSIconBack, { size: 15 })) : null,
				React.createElement("span", { className: "dsh-ws-chip", title: data ? data.root : "" },
						React.createElement(WSIconGit, null),
						React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, branch),
					),
					nChanges ? React.createElement("span", { className: "dsh-ws-sub", title: nChanges + " 个文件有 git 变更" }, nChanges + " 处变更") : null,
					React.createElement("span", { className: "dsh-ws-sub", style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }, title: data ? data.root : "" }, rootName),
					treeDirs.length ? React.createElement("button", { type: "button", className: "dsh-ws-iconbtn", title: allCollapsed ? "全部展开" : "全部折叠", onClick: toggleAll }, React.createElement(allCollapsed ? WSIconExpand : WSIconCollapse, { size: 14 })) : null,
					React.createElement("button", { type: "button", className: "dsh-ws-iconbtn" + (loading ? " dsh-ws-spin" : ""), title: "刷新", onClick: load }, React.createElement(WSIconRefresh, { size: 14 })),
				),
				err ? React.createElement("p", { style: S.err }, err) : null,
				diff ? renderDiff()
					: React.createElement("div", { style: { minHeight: 0, overflowY: "auto" } },
						!data && !err ? React.createElement("div", { style: { padding: "30px 0", textAlign: "center" } },
							React.createElement("div", { className: "dsh-ws-spin", style: { display: "inline-flex", color: "var(--dsw-alias-label-tertiary, #999)" } }, React.createElement(WSIconRefresh, { size: 18 })),
							React.createElement("p", { style: Object.assign({}, S.empty, { padding: 0, marginTop: 8 }) }, "加载工作区…"),
						)
							: renderChanges(),
					),
			);
		}
		var WS_ROW_TITLE = { flex: "1", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
		// 2026-08-21 myf: 状态指示改为「左侧 2px 色条 + 9px 字母」组合，色彩
		// 通过色条承载、字母仅作标识，保留信息密度同时不破坏行内节奏
		//（避免 15px 实心方块在 32px 行高里喧宾夺主）。
		function WSStatusBadge(props) {
			var s = wsStatusOf(props.st);
			return React.createElement("span", {
				style: {
					flex: "none", display: "inline-flex", alignItems: "center", gap: 4,
					height: 16, padding: "0 5px 0 4px", borderRadius: 3,
					background: s.c, color: "#fff", fontSize: 9, fontWeight: 700,
					letterSpacing: "0.04em", lineHeight: "16px",
				},
				title: s.title,
			}, s.label);
		}
		// 目录内是否有变更文件（用于目录行徽标）
		function wsDirStatus(node, changeMap) {
			var hit = null;
			(function walk(n) {
				if (hit) return;
				(n.files || []).forEach(function (rel) { if (changeMap[rel] && !hit) hit = changeMap[rel]; });
				Object.keys(n.dirs || {}).forEach(function (k) { walk(n.dirs[k]); });
			})(node);
			return hit;
		}

		// 2026-08-20 myf: 右侧竖排栏目 rail 配置 —— IDEA tool-window 风格，
		// 每个条目 = 一个栏目（icon + 标签 + 对应面板 tab）。点击切换
		// 窗口最右缘固定竖栏（IDEA tool-window rail）的栏目配置 —— 一级栏目。
		// 「研究区」展开 = details 列（ResearchDetailPanel 详细页：论文详细 /
		// 在线文献检索 / 综述 / 写作）。「工作区」= 同列展示文件树 + git
		// 分支/变更/diff + 文件预览（WorkspacePanel）。继续拓展只需 push
		//   { key: "code", label: "代码区", icon: IconCode, title: "代码区" }
		// 即可（对应内容在 ResearchDetailPanel.tabContent 里按需扩展）。
		// 2026-08-21 myf: 每个条目带 `tab`（点击展开后进入的 tab 名）与
		// `matches(tab)`（当前 tab 是否归属本栏目，用于 rail 高亮与再次
		// 点击收起判断）。研究区 = 除 workspace 外全部研究 tab；工作区 =
		// 仅 "workspace"。
		function researchTabOf(item) { return item.key === "workspace" ? "workspace" : (researchPanelTab.lastKind || "paper"); }
		function researchTabMatches(item, tab) {
			if (item.key === "workspace") return tab === "workspace";
			return !!tab && tab !== "workspace";
		}
		var RESEARCH_RAIL_ITEMS = [
			{ key: "research", label: "研究区", icon: IconResearch, title: "研究区：论文详细 / 在线文献检索 / 综述 / 写作" },
			{ key: "workspace", label: "工作区", icon: IconWorkspace, title: "工作区：文件浏览 / Git 变更 / Diff 预览" },
		];

		// 窗口最右缘固定竖栏（IDEA tool-window rail，position:fixed 脱离 AppFrame
		// grid，常驻最右缘）。一级栏目入口：「研究区」= 展开/收起 details 列
		// （内容 = ResearchDetailPanel 详细页）；「工作区」= 同列的文件树 /
		// git 状态预览。active 高亮跟随 details 列实际宽度（ResizeObserver，
		// 外部点论文也会点亮）+ 当前 tab 归属栏目（多栏目各自高亮）。
		// 由 apply 用 react-dom/client createRoot 挂到 document.body（#research-railbar）。
		function ResearchRail() {
			var [open, setOpen] = useState(false);
			var [tab, setTab] = useState(researchPanelTab.kind);
			useEffect(function () { return subscribeResearchPanelTab(setTab); }, []);
			useEffect(function () {
				// 2026-08-21 myf: 修复「二次点击无法收缩」—— railRoot 在 apply 时
				// 立即渲染，可能早于 AppFrame 首帧，此时 detailsCol 尚未出现，
				// 旧逻辑 findCol() 为 null 就跳过 ResizeObserver 建立，open 恒为
				// false，点击永远走 openDetails 分支（已打开时 no-op）。改为
				// 轮询等待 detailsCol 出现后再建立 observer，并同步一次 open。
				function findCol() { return document.querySelector("[class*=\"detailsCol\"]"); }
				function update() {
					var col = findCol();
					if (col) setOpen(col.getBoundingClientRect().width > 2);
				}
				var col = findCol();
				if (!col) {
					var tries = 0;
					var timer = setInterval(function () {
						col = findCol();
						if (col) {
							clearInterval(timer);
							update();
							if (typeof ResizeObserver !== "undefined") {
								var ro = new ResizeObserver(update);
								ro.observe(col);
							}
						} else if (++tries > 50) {
							clearInterval(timer);
						}
					}, 100);
					return function () { clearInterval(timer); };
				}
				update();
				var ro = null;
				if (typeof ResizeObserver !== "undefined") {
					ro = new ResizeObserver(update);
					ro.observe(col);
				}
				return function () { if (ro) ro.disconnect(); };
			}, []);
			return React.createElement("div", { className: "dsh-rr-railbar" },
				RESEARCH_RAIL_ITEMS.map(function (item) {
					var on = open && researchTabMatches(item, tab);
					return React.createElement("button", {
						type: "button",
						key: item.key,
						className: "dsh-rr-railbtn" + (on ? " dsh-rr-railbtn-on" : ""),
						title: item.title,
						onClick: function () {
							// 2026-08-21 myf: 开关以 detailsCol 实测宽度为准，不依赖
							// state（observer 未建立时 state 恒 false 会导致二次点击
							// 无法收缩）。宽度 > 2 视为已展开，否则视为已收起。
							// 多栏目：当前 tab 归属本栏目且已展开 → 收起；否则展开
							// 并切换到本栏目的 tab。
							var col = document.querySelector("[class*=\"detailsCol\"]");
							var isOpen = !!(col && col.getBoundingClientRect().width > 2);
							if (isOpen && researchTabMatches(item, researchPanelTab.kind)) {
								// 收起：关 details 列并清 tab（内容区显示空态）
								try { rwsLayout.closeDetails(); } catch (e) { }
								setResearchPanelTab(null);
							} else {
								// 展开：开 details 列，进入本栏目 tab
								try { rwsLayout.openDetails(); } catch (e) { }
								setResearchPanelTab(researchTabOf(item));
							}
						},
					},
						React.createElement(item.icon, { size: 18 }),
						React.createElement("span", { className: "dsh-rr-rail-tip" }, item.label),
					);
				}),
			);
		}

		// 2026-08-19 myf: 综述 composer 已改为自加载论文目录（checkbox 勾选），
		// 不再需要 region → panel 的选区同步 store，相关代码已移除。

		// Details-panel header title (conversation.details.research.title seat):
		// driven by researchPanelTab — each tab maps to a fixed title.
		function ResearchDetailTitle(props) {
			var [tab, setTab] = useState(researchPanelTab.kind);
			useEffect(function () { return subscribeResearchPanelTab(setTab); }, []);
			if (tab === "paper") return React.createElement("span", null, "论文详细");
			if (tab === "preview") return React.createElement("span", null, "外部预览");
			if (tab === "search") return React.createElement("span", null, "在线文献检索");
			if (tab === "review") return React.createElement("span", null, "综述");
			// 2026-08-19 myf: 右窗栏标题与 tab 名保持一致（写作助手 → 写作）
			if (tab === "writing") return React.createElement("span", null, "写作");
			// 2026-08-21 myf: 工作区栏目（文件浏览 / git 变更 / diff 预览）
			if (tab === "workspace") return React.createElement("span", null, "工作区");
			// 2026-08-19 myf: 右窗栏竖栏常驻后，空态标题显示「研究区」而非 dsh 默认「详情」
			return React.createElement("span", null, "研究区");
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
			if (st === "PROCESSING") return "var(--dsw-alias-button-primary-fill)";
			if (st === "FAILED") return "var(--dsw-alias-state-error-primary, #dc2626)";
			return "var(--dsw-alias-label-tertiary, #9ca3af)";
		}
		function flattenFolders(tree, out) {
			// 2026-08-19 myf: 文件夹仅一级（项目 → 文件夹 → 论文，无二级），
			// 移动论文时目标只列出项目直属文件夹。
			(tree || []).forEach(function (f) {
				out.push({ id: f.id, name: f.name, depth: 0 });
			});
			return out;
		}

		// 2026-08-19 myf: 把外文检索结果里的作者/期刊数组转换为 BibTeX 风格的「姓, 名首字母」列表，
		// 喂给 APA / MLA / GBT 三种格式。形如 [{family:"Smith", given:"John A."}] 或
		// 直接是 "John Smith" 字符串都能正确处理。
		function formatAuthorList(authors) {
			if (!Array.isArray(authors)) return [];
			return authors.map(function (a) {
				if (a && typeof a === "object") {
					var fam = a.family || a.last || a.surname || a.name || "";
					var giv = a.given || a.first || "";
					if (fam && giv) {
						// initials: "John A." -> "J. A."
						var init = String(giv).split(/\s+/).filter(Boolean).map(function (p) {
							return p.replace(/[.,]/g, "").charAt(0).toUpperCase() + ".";
						}).join(" ");
						return { family: fam, given: giv, initials: init };
					}
					if (fam) return { family: fam, given: "", initials: "" };
					if (giv) return { family: giv, given: "", initials: "" };
				}
				if (typeof a === "string" && a.trim()) {
					var parts = a.trim().split(/\s+/);
					if (parts.length === 1) return { family: parts[0], given: "", initials: "" };
					var last0 = parts.pop();
					var giv0 = parts.join(" ");
					return { family: last0, given: giv0, initials: giv0.split(/\s+/).filter(Boolean).map(function (p) { return p.replace(/[.,]/g, "").charAt(0).toUpperCase() + "."; }).join(" ") };
				}
				return null;
			}).filter(Boolean);
		}
		function joinAPA(authors) {
			// APA 7: Smith, J. A.; Smith, J. A., & Wang, L.
			if (!authors.length) return "";
			var lastFmt = authors.map(function (a) { return a.family + (a.initials ? ", " + a.initials : ""); });
			if (lastFmt.length === 1) return lastFmt[0];
			if (lastFmt.length === 2) return lastFmt[0] + " & " + lastFmt[1];
			return lastFmt.slice(0, -1).join(", ") + ", & " + lastFmt[lastFmt.length - 1];
		}
		function joinMLA(authors) {
			// MLA 9: First author as "Smith, John A."; subsequent as "John A. Smith".
			if (!authors.length) return "";
			if (authors.length === 1) return authors[0].family + (authors[0].given ? ", " + authors[0].given : "");
			var first = authors[0];
			var rest = authors.slice(1).map(function (a) { return (a.given ? a.given + " " : "") + a.family; });
			return first.family + (first.given ? ", " + first.given : "") + ", " + rest.join(", ") + (authors.length > 2 ? ", et al" : " et al");
		}
		function joinGBT(authors) {
			// GBT 7714-2015: 前 3 名作者用 ", " 连接；3 名以上用 ", 等"；个人作者用 "姓 名" 形式。
			if (!authors.length) return "";
			var up3 = authors.slice(0, 3);
			var rest = up3.map(function (a) { return a.family + (a.given ? " " + a.given : ""); });
			if (authors.length <= 3) {
				if (authors.length === 1) return rest[0];
				if (authors.length === 2) return rest[0] + ", " + rest[1];
				return rest[0] + ", " + rest[1] + ", " + rest[2];
			}
			return rest[0] + ", " + rest[1] + ", " + rest[2] + ", 等";
		}
		function citeAPA(p) {
			var auths = formatAuthorList(p.authors);
			var a = joinAPA(auths);
			var y = p.year ? (" (" + p.year + ").") : ".";
			var t = (p.title || "(untitled)") + ".";
			var s = p.venue || p.source ? ((p.venue || sourceLabel(p.source) || "") + ".") : "";
			var d = p.doi ? (" https://doi.org/" + p.doi) : (p.url ? (" " + p.url) : "");
			return [a, t, s, d].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || ((p.title || "(untitled)") + ".");
		}
		function citeMLA(p) {
			var auths = formatAuthorList(p.authors);
			var a = joinMLA(auths);
			var y = p.year ? (" " + p.year + ".") : "";
			var t = '"' + (p.title || "(untitled)") + '."';
			var v = p.venue || p.source ? (" " + (p.venue || sourceLabel(p.source) || "") + ",") : "";
			var d = p.doi ? (" doi:" + p.doi + ".") : (p.url ? (" " + p.url + ".") : "");
			return (a ? a + ". " : "") + t + v + y + d;
		}
		function citeGBT(p) {
			var auths = formatAuthorList(p.authors);
			var a = joinGBT(auths);
			var y = p.year ? (" " + p.year + ".") : ".";
			var t = (p.title || "(untitled)") + "[J].";
			var v = p.venue || p.source ? ((p.venue || sourceLabel(p.source) || "") + ".") : "";
			var d = p.doi ? (" DOI:" + p.doi + ".") : (p.url ? (" " + p.url + ".") : "");
			return (a ? a + "." : "") + t + (v ? " " + v : "") + y + d;
		}
		function copyToClipboard(text) {
			if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
				return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
			}
			return Promise.resolve(fallbackCopy(text));
		}
		function fallbackCopy(text) {
			try {
				var ta = document.createElement("textarea");
				ta.value = text;
				ta.style.position = "fixed"; ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.select();
				var ok = document.execCommand("copy");
				document.body.removeChild(ta);
				return ok;
			} catch (e) { return false; }
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
			// 2026-08-19 myf: 批量移动弹窗打开时主动拉一次每个**项目**的文件夹树，
			// 跨项目也能选（用户想把 test 的论文搬到 abc 项目下某文件夹时也能选）。
			// 不只拉选中论文所属项目，改为拉 props.projects 全部项目——确保任何
			// 目标项目的新文件夹都能立刻看到。文件总数据优先用 freshFolders。
			var [freshFolders, setFreshFolders] = useState({});
			useEffect(function () {
				setText(dialog && dialog.initial ? dialog.initial : "");
				setText2("");
				setTargetFolder(dialog && dialog.kind === "movePapers" ? "" : "root");
				setImportProjectId("");
				setBusy(false); setMsg(null);
				if (dialog && dialog.kind === "movePapers") {
					var allProjs = props.projects || [];
					if (!allProjs.length) { setFreshFolders({}); return; }
					setFreshFolders({});
					Promise.all(allProjs.map(function (p) {
						var pid = p.id;
						return api("/research-folder/projects/" + pid + "/folders/tree").then(function (j) {
							return { pid: pid, folders: (ok(j) && j.data) ? j.data : [] };
						}).catch(function () { return { pid: pid, folders: [] }; });
					})).then(function (rs) {
						var n = {};
						rs.forEach(function (r) { n[r.pid] = r.folders; });
						setFreshFolders(n);
					});
				} else {
					setFreshFolders({});
				}
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
				: kind === "deletePapers" ? "删除论文"
				: kind === "movePaper" ? "移动论文"
				: kind === "movePapers" ? "批量移动论文" : "";
			var confirmOnly = kind === "deleteProject" || kind === "deleteFolder" || kind === "deletePaper" || kind === "deletePapers";

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
					// 2026-08-19 myf: 携带 pdf_url，后端将标记 PROCESSING 并触发 AI worker
					// 下载 PDF 解析（之前只传元数据，导入后只有标题没有实质 PDF 文件）。
					req = { method: "POST", url: "/research-paper/projects/" + pid + "/papers/import", body: { doi: ext.doi || "", title: ext.title || "", authors: ext.authors || [], year: ext.year || null, pdfUrl: ext.pdf_url || null } };
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
				} else if (kind === "deletePapers") {
					// 2026-08-19 myf: 批量删除——并行调用单篇删除接口，全部成功才关闭弹窗
					var ids = (d.papers || []).map(function (p) { return p.id; }).filter(function (id) { return id != null; });
					if (!ids.length) { setMsg("未选择论文"); return; }
					setBusy(true);
					Promise.all(ids.map(function (id) {
						return api("/research-paper/papers/" + id, { method: "DELETE", credentials: "include" });
					})).then(function (results) {
						if (results.every(function (j) { return ok(j); })) props.onDone && props.onDone(kind, dialog);
						else { setMsg("部分论文删除失败，请重试"); setBusy(false); }
					}).catch(function () { setMsg("网络错误"); setBusy(false); });
					return;
				} else if (kind === "movePaper") {
					req = { method: "PUT", url: "/research-paper/papers/" + d.paper.id + "/move", body: { folderId: targetFolder === "root" ? null : Number(targetFolder) } };
				} else if (kind === "movePapers") {
					// 2026-08-19 myf: 批量移动——后端无批量接口，按 (projectId, folderId) 分组后
					// 并行调用单篇 PUT /move；targetFolderValue 形如 "pid:root" / "pid:<folderId>"。
					// 2026-08-19 myf: 去掉 _skipped 跨项目跳过——支持「把 test 的论文搬到 abc 项目下」。
					var papers = d.papers || [];
					if (!papers.length) { setMsg("未选择论文"); return; }
					if (!targetFolder || !/^\d+:(root|\d+)$/.test(targetFolder)) { setMsg("请选择目标文件夹"); return; }
					setBusy(true);
					var tParts = targetFolder.split(":");
					var tPid = Number(tParts[0]);
					var tFid = tParts[1] === "root" ? null : Number(tParts[1]);
					Promise.all(papers.map(function (p) {
						return api("/research-paper/papers/" + p.id + "/move", { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ folderId: tFid, projectId: tPid }) });
					})).then(function (results) {
						if (results.every(function (j) { return ok(j); })) props.onDone && props.onDone(kind, dialog);
						else { setMsg("部分论文移动失败，请重试"); setBusy(false); }
					}).catch(function () { setMsg("网络错误"); setBusy(false); });
					return;
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
						: kind === "deletePapers" ? "选中的 " + ((dialog.papers || []).length) + " 篇论文"
						: "论文「" + (dialog.paper && dialog.paper.title) + "」";
					return React.createElement("p", { style: S.text }, "确定删除 " + what + " 吗？此操作不可撤销。");
				}
				if (kind === "movePaper") {
					return React.createElement("select", { style: Object.assign({}, S.select, { width: "100%", height: 36 }), value: targetFolder, onChange: function (e) { setTargetFolder(e.target.value); } },
						React.createElement("option", { value: "root" }, "根目录（无文件夹）"),
						(dialog.folderOptions || []).map(function (f) { return React.createElement("option", { key: f.id, value: String(f.id) }, new Array(f.depth + 1).join("　") + f.name); }),
					);
				}
				if (kind === "movePapers") {
					// 2026-08-19 myf: 把选中论文涉及的 (projectId, projectName, folderId, folderName) 拍平成
					// 单个下拉选项；value = "projectId:root|folderId"，便于 submit 直接分组。
					// 文件夹来源优先用 freshFolders（弹窗打开时主动拉一次），保证新文件夹可见；
					// 拉取未完成前用 props.foldersByProject 兜底。
					// 跨项目也列出（用户希望把 test 论文搬到 abc 项目某文件夹时也能选）。
					var papers2 = dialog.papers || [];
					var projName = {};
					(props.projects || []).forEach(function (pp) { projName[pp.id] = pp.name || ("#" + pp.id); });
					// 跨项目列出所有项目；保持 props.projects 原顺序（用户视角的项目排序）
					var allPids = (props.projects || []).map(function (pp) { return pp.id; });
					function foldersFor(pid) {
						if (Object.prototype.hasOwnProperty.call(freshFolders, pid)) return freshFolders[pid] || [];
						return (props.foldersByProject && props.foldersByProject[pid]) || [];
					}
					function flatFolders(items) {
						// 2026-08-19 myf: 把树形文件夹拍平成 [{id, name, depth}]，按 depth/name 排序；
						// 与 body() movePaper 单选分支保持一致（flattenFolders 是单选分支工具函数，
						// 这里直接用本地版本以减少耦合）。
						var out = [];
						function walk(arr, depth) {
							(arr || []).forEach(function (f) {
								out.push({ id: f.id, name: f.name, depth: depth });
								if (f.children && f.children.length) walk(f.children, depth + 1);
							});
						}
						walk(items, 0);
						return out;
					}
					var row = function (pid, fid, fname, depth) {
						var pname = projName[pid] || ("#" + pid);
						// 根目录项只显示项目名，不再带「（无文件夹）」后缀（用户反馈）
						var label = pname + (fid == null ? "" : " · " + new Array(depth + 1).join("　") + fname);
						return React.createElement("option", { key: pid + ":" + (fid == null ? "root" : fid), value: pid + ":" + (fid == null ? "root" : fid) }, label);
					};
					return React.createElement("div", null,
						React.createElement("p", { style: S.text }, "将选中的 " + papers2.length + " 篇论文移动到："),
						React.createElement("select", { style: Object.assign({}, S.select, { width: "100%", height: 36 }), value: targetFolder, onChange: function (e) { setTargetFolder(e.target.value); } },
							React.createElement("option", { value: "" }, "选择目标…"),
							allPids.flatMap(function (pid) {
								var folders = flatFolders(foldersFor(pid));
								return [row(pid, null, null, 0)].concat(folders.map(function (f) { return row(pid, f.id, f.name, f.depth); }));
							}),
						),
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
			// 2026-08-19 myf: 本地 PDF 上传（项目行加号 -> 文件选择器 ->
			// research-file 预签名上传 -> research-paper 创建并触发 AI 分析）
			// 支持多文件；底部进度条弹窗显示队列与每个文件进度。
			var fileRef = useRef(null);
			var uploadTargetRef = useRef(null);
			// 上传队列 UI：null 或 { total, done, failed, analyzed, current, list, finished }
			// done=上传完成进入解析数；analyzed=解析已结束（READY/FAILED）数
			// list[i] = { name, state: pending|uploading|analyzing|done|error, progress }
			var [upload, setUpload] = useState(null);
			// 底部进度条弹窗样式（研究区根容器 relative，absolute 定位到底部）
			// 2026-08-19 myf: 颜色全部走 dsh 主题变量（bg-layer-2/border-l2/skeleton），
			// 深浅色主题自动适配，不再用不存在的 fill-bg/stroke-default 回退白底。
			var uploadBarStyle = {
				position: "absolute",
				left: 8, right: 8, bottom: 8,
				zIndex: 30,
				background: "var(--dsw-alias-bg-layer-2, #fff)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))",
				borderRadius: 8,
				padding: "8px 10px",
				boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
			};

			// 打开文件选择器（记录目标项目/文件夹），选中 PDF 后走预签名上传链路。
			// 打开文件选择器（记录目标项目/文件夹）。项目行加号调用时不传 folderId（根目录）。
			function startPdfUpload(projectId, folderId) {
				uploadTargetRef.current = { projectId: projectId, folderId: folderId == null ? null : folderId };
				fileRef.current && fileRef.current.click();
			}
			// 串行上传多个 PDF：upload-url -> XHR multipart（带进度）-> 创建论文 ->
			// 轮询解析状态。底部进度条覆盖「上传 + 解析」两个阶段：上传完只是进入
			// 解析阶段，全部论文 READY/FAILED 才显示完成并自动关闭。
			function uploadFiles(target, files) {
				var total = files.length;
				var list = files.map(function (f) { return { name: f.name, state: "pending", progress: 0 }; });
				var successIds = [];
				var analyzed = 0;     // 解析已结束（READY/FAILED）的论文数
				var uploadFail = 0;   // 上传失败数
				var idx = 0;
				setUpload({ total: total, done: 0, failed: 0, analyzed: 0, current: null, list: list, finished: false });
				// 全部文件上传完 + 全部论文解析结束 -> 完成态：刷新树 + 右窗打开最新论文
				function checkAll() {
					var uploaded = successIds.length + uploadFail;
					if (uploaded >= total && analyzed >= successIds.length) {
						setUpload(function (u) { return u ? Object.assign({}, u, { finished: true, current: null }) : u; });
						loadTree();
						if (successIds.length) {
							var latest = successIds[successIds.length - 1];
							setResearchDetail(latest);
							if (props.openDetails) props.openDetails();
							refreshResearchDetail();
						}
						setTimeout(function () { setUpload(null); }, 3000); // 完成态停留后自动关闭
					}
				}
				// 轮询一篇论文的解析状态：PROCESSING/UPLOADED/PENDING 继续等待，
				// READY 成功、FAILED 失败；未知状态/网络错误按重试次数兜底结束。
				function pollPaper(paperId, i, retries) {
					api("/research-paper/papers/" + paperId).then(function (j) {
						var st = ok(j) && j.data ? j.data.status : null;
						if (st === "READY" || st === "SUCCESS") {
							analyzed++;
							setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "done", progress: 100 }); return Object.assign({}, u, { analyzed: analyzed, list: l }); });
							checkAll();
						} else if (st === "FAILED" || st === "ERROR") {
							analyzed++;
							setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "error", progress: 100 }); return Object.assign({}, u, { analyzed: analyzed, failed: u.failed + 1, list: l }); });
							checkAll();
						} else if ((st === "PROCESSING" || st === "UPLOADED" || st === "PENDING" || st == null) && retries < 60) {
							setTimeout(function () { pollPaper(paperId, i, retries + 1); }, 2500);
						} else {
							analyzed++;
							setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "error", progress: 100 }); return Object.assign({}, u, { analyzed: analyzed, failed: u.failed + 1, list: l }); });
							checkAll();
						}
					}).catch(function () {
						if (retries < 60) setTimeout(function () { pollPaper(paperId, i, retries + 1); }, 2500);
						else {
							analyzed++;
							setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "error", progress: 100 }); return Object.assign({}, u, { analyzed: analyzed, failed: u.failed + 1, list: l }); });
							checkAll();
						}
					});
				}
				function next() {
					if (idx >= total) return; // 上传全部启动；完成判定由 checkAll 轮询驱动
					var i = idx++;
					var file = files[i];
					var key = null;
					setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "uploading", progress: 0 }); return Object.assign({}, u, { current: i, list: l }); });
					api("/research-file/upload-url", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ fileName: file.name }),
					}).then(function (j) {
						if (!ok(j)) throw new Error(j.message || "获取上传地址失败");
						var up = j.data.url;
						key = j.data.fields.key;
						return new Promise(function (resolve, reject) {
							var fd = new FormData();
							fd.append("file", file);
							fd.append("key", key);
							var xhr = new XMLHttpRequest();
							xhr.open("POST", up);
							xhr.withCredentials = true;
							xhr.upload.onprogress = function (ev) {
								if (!ev.lengthComputable) return;
								var p = Math.round(ev.loaded / ev.total * 100);
								setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { progress: p }); return Object.assign({}, u, { list: l }); });
							};
							xhr.onload = function () {
								if (xhr.status >= 200 && xhr.status < 300) {
									try { resolve(JSON.parse(xhr.responseText)); }
									catch (e2) { reject(new Error("上传响应异常")); }
								} else reject(new Error("上传失败 HTTP " + xhr.status));
							};
							xhr.onerror = function () { reject(new Error("网络错误")); };
							xhr.send(fd);
						});
					}).then(function (j2) {
						if (!ok(j2)) throw new Error(j2.message || "上传失败");
						return api("/research-paper/projects/" + target.projectId + "/papers", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ fileName: file.name, s3Key: key, folderId: target.folderId }),
						});
					}).then(function (j3) {
						if (!ok(j3)) throw new Error(j3.message || "创建论文失败");
						if (j3.data && j3.data.id) {
							successIds.push(j3.data.id);
							setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "analyzing", progress: 100 }); return Object.assign({}, u, { done: u.done + 1, list: l }); });
							pollPaper(j3.data.id, i, 0);
						} else {
							uploadFail++;
							setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "error", progress: 100 }); return Object.assign({}, u, { failed: u.failed + 1, list: l }); });
							checkAll();
						}
						next();
					}).catch(function (err) {
						uploadFail++;
						setUpload(function (u) { if (!u) return u; var l = u.list.slice(); l[i] = Object.assign({}, l[i], { state: "error", progress: 100 }); return Object.assign({}, u, { failed: u.failed + 1, list: l }); });
						next();
						checkAll();
					});
				}
				next();
			}
			function onFilePicked(e) {
				var files = e.target.files ? Array.prototype.slice.call(e.target.files) : [];
				e.target.value = ""; // 允许重复选择同一文件
				var target = uploadTargetRef.current;
				if (!files.length || !target) return;
				var pdfs = files.filter(function (f) { return /\.pdf$/i.test(f.name); });
				if (!pdfs.length) {
					setUpload({ total: 0, done: 0, failed: 0, analyzed: 0, current: null, finished: true, list: [{ name: "未选择 PDF 文件", state: "error", progress: 100 }] });
					setTimeout(function () { setUpload(null); }, 2000);
					return;
				}
				uploadFiles(target, pdfs);
			}

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
						// 2026-08-19 myf: 把当前树元信息广播给 sidebar，批量移动弹窗读取用
						setResearchTreeMeta(projs, fbp);
						// 2026-08-19 myf: 树刷新完成广播版本号，右窗综述目录及时刷新
						bumpResearchTree();
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
				// 2026-08-19 myf: 用户不需要在菜单里新建文件夹（仅保留一级文件夹，
				// 新建入口不再暴露；文件夹随项目结构由后端/导入流程管理）。
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
					if (id === "move") setDialog({ kind: "movePaper", paper: target.paper, folderOptions: flattenFolders(foldersByProject[target.paper.projectId] || [], []) });
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
						// 2026-08-19 myf: 文件夹仅一级，不再渲染二级子文件夹
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
							React.createElement("button", { type: "button", className: "dsh-rr-iconbtn", title: "添加 PDF 文件", onClick: function (e) { e.stopPropagation(); startPdfUpload(p.id); } }, React.createElement(IconPlus, null)),
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
						// 2026-08-19 myf: 移除「检索在线文献库」入口——在线检索已完全
						// 在右窗栏「在线文献检索」tab 内完成（自带检索表单），左侧不再需要
						React.createElement("button", { type: "button", style: S.iconBtn, title: "视图设置", onClick: function (e) { openViewMenu(e); } }, React.createElement(IconViewOptions, { size: 16 })),
						React.createElement("button", { type: "button", style: S.iconBtn, title: "新建项目", onClick: function () { setDialog({ kind: "newProject" }); } }, React.createElement(IconFolderAdd, { size: 16 })),
					),
				),
				React.createElement("div", { style: S.listArea },
					React.createElement("div", { style: S.list }, listBody()),
				),
				upload ? React.createElement("div", { style: uploadBarStyle },
					React.createElement("style", null, "@keyframes dshUploadSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }"),
					React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
						React.createElement("span", { style: { fontWeight: 600, fontSize: 12, color: "var(--dsw-alias-label-primary, #111)" } },
							upload.finished ? "上传完成"
								: (upload.done + upload.failed) < upload.total ? "上传中…"
									: "解析中…"),
						React.createElement("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)" } },
							upload.finished ? (upload.analyzed || 0) + "/" + (upload.total || 0) + " 完成"
								: (upload.done + upload.failed) < upload.total ? "上传 " + (upload.done + upload.failed) + "/" + (upload.total || 0)
									: "解析 " + (upload.analyzed || 0) + "/" + (upload.total || 0)),
					),
					(upload.list || []).map(function (it, i) {
						var label = it.state === "done" ? "完成" : it.state === "error" ? "失败" : it.state === "analyzing" ? "解析中…" : it.state === "uploading" ? (it.progress || 0) + "%" : "等待中";
						// 状态色走主题变量（深色主题自动提亮），fallback 保持原浅色值
						var color = it.state === "error" ? "var(--dsw-alias-state-error-primary, #dc2626)"
							: it.state === "done" ? "var(--dsw-alias-state-success-primary, #16a34a)"
								: "var(--dsw-alias-button-primary-fill)";
						var barWidth = it.state === "analyzing" ? "40%" : (it.state === "error" || it.state === "done" ? "100%" : (it.progress || 0) + "%");
						var barAnim = it.state === "analyzing" ? { animation: "dshUploadSlide 1.4s linear infinite" } : {};
						return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
							React.createElement("span", { style: { fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170, color: "var(--dsw-alias-label-secondary, #666)" } }, it.name),
							React.createElement("div", { style: { width: 110, height: 6, borderRadius: 3, background: "var(--dsw-alias-bg-skeleton, rgba(0,0,0,.06))", overflow: "hidden" } },
								React.createElement("div", { style: Object.assign({ width: barWidth, height: "100%", background: color, transition: "width 0.2s" }, barAnim) }),
							),
							React.createElement("span", { style: { fontSize: 11, width: 48, textAlign: "right", color: it.state === "error" ? "var(--dsw-alias-state-error-primary, #dc2626)" : "var(--dsw-alias-label-secondary, #666)" } }, label),
						);
					}),
				) : null,
				React.createElement("input", { ref: fileRef, type: "file", accept: "application/pdf,.pdf", multiple: true, style: { display: "none" }, onChange: onFilePicked }),
				menu ? React.createElement(Dropdown, { x: menu.x, y: menu.y, items: menu.items, onSelect: function (id) { handleMenuSelect(menu.target, id); setMenu(null); }, onClose: function () { setMenu(null); } }) : null,
				dialog ? React.createElement(DialogForm, { dialog: dialog, projects: projects || [], onClose: function () { setDialog(null); }, onDone: function (kind, d) { setDialog(null); if (kind === "deletePaper" && removeSel) removeSel(d.paper.id); loadTree(); } }) : null,
			);
		}

		// ── 综述生成（底部栏触发，使用已选论文）──────────────────────────
		function ReviewComposer(props) {
			var [topic, setTopic] = useState("");
			var [taskId, setTaskId] = useState(null);
			var [markdown, setMarkdown] = useState(null);
			var [err, setErr] = useState(null);
			// 2026-08-19 myf: 综述不再依赖左侧勾选同步——直接展示当前已上传论文的
			// 目录，并按 项目 → 文件夹 → 论文 分组（文件夹分类），checkbox 默认全选。
			var [papers, setPapers] = useState(null); // null = 加载中
			var [groups, setGroups] = useState(null); // [{ id, name, folders, papers }]
			var [checked, setChecked] = useState({}); // paperId -> true/false
			var [expandedGroups, setExpandedGroups] = useState({}); // 分组折叠态，默认展开
			var [loadErr, setLoadErr] = useState(null);
			// 2026-08-19 myf: 目录加载函数——初始加载 + 订阅左侧树刷新广播（新建/移动
			// 文件夹、删除、上传等）后自动重新拉取，右侧目录与左侧保持同步。
			var loadDir = useCallback(function () {
				setLoadErr(null);
				api("/research-project?page=0&size=100").then(function (j) {
					if (!ok(j)) { setLoadErr(j.message || "加载论文目录失败"); setPapers([]); return; }
					var projs = (j.data && j.data.items) || [];
					return Promise.all(projs.map(function (p) {
						return Promise.all([
							api("/research-folder/projects/" + p.id + "/folders/tree"),
							api("/research-paper/projects/" + p.id + "/papers?folderId=-1&size=200"),
						]).then(function (rs) {
							var folders = (ok(rs[0]) && rs[0].data) ? rs[0].data : [];
							var items = (ok(rs[1]) && rs[1].data && rs[1].data.items) ? rs[1].data.items : [];
							items.forEach(function (it) { it.projectId = p.id; it.projectName = p.name; });
							return { id: p.id, name: p.name, folders: folders, papers: items };
						}).catch(function () { return { id: p.id, name: p.name, folders: [], papers: [] }; });
					})).then(function (gs) {
						var all = [];
						gs.forEach(function (g) { all = all.concat(g.papers); });
						setGroups(gs); setPapers(all);
						// 刷新时保留用户已勾选状态，新出现的论文默认勾选
						setChecked(function (old) {
							var chk = {};
							all.forEach(function (pp) { chk[pp.id] = old && old[pp.id] !== undefined ? old[pp.id] : true; });
							return chk;
						});
					});
				}).catch(function () { setLoadErr("网络错误"); setPapers([]); });
			}, []);
			useEffect(function () {
				loadDir();
				return subscribeResearchTree(loadDir);
			}, [loadDir]);
			var selected = papers ? papers.filter(function (p) { return checked[p.id]; }) : [];
			// 分组目录渲染：项目 → 文件夹（一级）→ 论文；分组标题行点击折叠
			function renderReviewPaper(p, padLeft) {
				return React.createElement("label", { key: p.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 7px " + padLeft + "px", cursor: "pointer", borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.05))" } },
					React.createElement("input", { type: "checkbox", style: S.checkbox, checked: !!checked[p.id], onChange: function () { setChecked(function (c) { var n = Object.assign({}, c); n[p.id] = !n[p.id]; return n; }); } }),
					React.createElement("span", { style: Object.assign({}, S.statusDot, { background: dotColor(p.status) }), title: p.status || "" }),
					React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "var(--dsw-alias-label-primary, #111)" } }, p.title || "(untitled)"),
				);
			}
			function toggleGroup(k) {
				setExpandedGroups(function (m) { var n = Object.assign({}, m); n[k] = !n[k]; return n; });
			}
			function renderReviewFolder(f, depth, byFolder) {
				var key = "f-" + f.id;
				var open = expandedGroups[key] !== false;
				return React.createElement("div", { key: key },
					React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "5px 12px 5px " + (12 + depth * 18) + "px", cursor: "pointer", fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", fontWeight: 600, userSelect: "none" }, onClick: function () { toggleGroup(key); } },
						React.createElement("span", { style: { display: "inline-flex", width: 13, flex: "none" } }, open ? React.createElement(IconFolderOpen, { size: 13 }) : React.createElement(IconFolderClose, { size: 13 })),
						React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.name),
					),
					open ? React.createElement("div", null,
						// 2026-08-19 myf: 文件夹仅一级，综述目录同样不渲染二级子文件夹
						(byFolder[f.id] || []).map(function (p) { return renderReviewPaper(p, 36 + depth * 18); }),
					) : null,
				);
			}
			function renderReviewGroup(g) {
				var key = "proj-" + g.id;
				var open = expandedGroups[key] !== false;
				var byFolder = {};
				g.papers.forEach(function (p) { var k = p.folderId == null ? "root" : p.folderId; (byFolder[k] = byFolder[k] || []).push(p); });
				return React.createElement("div", { key: key },
					React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", fontWeight: 700, userSelect: "none", background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.02))" }, onClick: function () { toggleGroup(key); } },
						React.createElement("span", { style: { display: "inline-flex", width: 13, flex: "none" } }, open ? React.createElement(IconFolderOpen, { size: 13 }) : React.createElement(IconFolderClose, { size: 13 })),
						React.createElement("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, g.name),
						React.createElement("span", { style: { flex: "none", fontSize: 11, color: "var(--dsw-alias-label-tertiary, #999)" } }, g.papers.length + " 篇"),
					),
					open ? React.createElement("div", null,
						(byFolder.root || []).map(function (p) { return renderReviewPaper(p, 36); }),
						g.folders.map(function (f) { return renderReviewFolder(f, 0, byFolder); }),
					) : null,
				);
			}
			useEffect(function () {
				if (taskId == null) return;
				var timer = setInterval(function () {
					api("/research-review/" + taskId).then(function (j) {
						if (!ok(j)) return;
						var st = j.data && j.data.status;
						// 2026-08-19 myf: 成功时同时清空 taskId，按钮从「生成中…」恢复为「生成综述」
						if (st === "SUCCESS") { clearInterval(timer); setTaskId(null); setMarkdown((j.data.result && j.data.result.markdown) || "(empty)"); }
						else if (st === "FAILED") { clearInterval(timer); setErr(j.data.error || "综述生成失败"); setTaskId(null); }
					});
				}, 3000);
				return function () { clearInterval(timer); };
			}, [taskId]);
			var generate = function () {
				if (!topic.trim()) { setErr("请输入综述主题"); return; }
				if (!selected.length) { setErr("请至少选择一篇论文"); return; }
				setErr(null); setMarkdown(null);
				api("/research-review/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paperIds: selected.map(function (p) { return p.id; }), topic: topic.trim() }) })
					.then(function (j) {
						if (!ok(j)) { setErr(j.message || "提交失败"); return; }
						setTaskId(j.data.taskId);
					});
			};
			return React.createElement("div", { style: Object.assign({}, S.root, { paddingTop: 2, paddingRight: 0 }) },
				// 2026-08-19 myf: 移除「生成综述 · 已选 X / X 篇」标题与返回按钮（顶部 tab 行可切换）
				// 当前已上传论文目录：按 项目 → 文件夹 分组（可折叠），checkbox 勾选参与综述，默认全选
				React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.06))", borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.06))" } },
					loadErr ? React.createElement("p", { style: S.err, padding: 8 }, loadErr)
						: papers == null ? React.createElement("p", { style: S.empty }, "加载论文目录…")
						: papers.length === 0 ? React.createElement("p", { style: S.empty }, "暂无已上传论文")
						: groups.map(function (g) { return renderReviewGroup(g); }),
				),
				React.createElement("div", { style: { padding: "0 12px" } },
					React.createElement("div", { style: S.field },
						React.createElement("span", { style: S.fieldLabel }, "主题"),
						React.createElement("input", { style: S.input, placeholder: "如：Acoustic classification of gibbon vocalizations", value: topic, onChange: function (e) { setTopic(e.target.value); } }),
					),
					err ? React.createElement("p", { style: S.err, padding: 0 }, err) : null,
					// 2026-08-19 myf: 生成综述按钮样式与「下载 PDF」保持一致（btn 而非 btnPrimary）
					React.createElement("button", { style: S.btn, onClick: generate, disabled: taskId != null }, taskId != null ? "生成中…" : "生成综述"),
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
			return React.createElement("div", { style: Object.assign({}, S.root, { paddingTop: 2, paddingRight: 0 }) },
				// 2026-08-19 myf: 移除「写作助手」标题（顶部 tab 行可切换）
				React.createElement("div", { style: { padding: "0 12px" } },
					React.createElement("textarea", { style: S.textarea, placeholder: "粘贴要处理的文本…", value: text, onChange: function (e) { setText(e.target.value); } }),
					React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", margin: "8px 0" } },
						React.createElement("select", { style: S.select, value: action, onChange: function (e) { setAction(e.target.value); } },
							ACTIONS.map(function (a) { return React.createElement("option", { key: a[0], value: a[0] }, a[1]); }),
						),
						// 2026-08-19 myf: 改写按钮样式与「下载 PDF」保持一致（btn 而非 btnPrimary）
						React.createElement("button", { style: S.btn, onClick: rewrite, disabled: busy }, busy ? "处理中…" : "改写"),
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
			// 2026-08-19 myf: 选区提到 module-level store —— dsh 切 conversation
			// 卸载重挂 sidebar.research 时选区不丢，否则刚选完就丢。
			var [sel, setSel] = useState(researchSelection);
			useEffect(function () { return subscribeResearchSelection(setSel); }, []);
			// 2026-08-19 myf: 树元信息（项目 + 文件夹）订阅，喂给批量移动弹窗
			var [treeMeta, setTreeMeta] = useState(researchTreeMeta);
			useEffect(function () { return subscribeResearchTreeMeta(setTreeMeta); }, []);
			var [focused, setFocused] = useState(null);
			var [items, setItems] = useState([]);
			// 2026-08-19 myf: 批量删除确认弹窗 + 删除后刷新树（refreshTick 触发 LibraryView 重载）
			var [dialog, setDialog] = useState(null);
			var [refreshTick, setRefreshTick] = useState(0);
			var onPapersCb = useCallback(function (list) { setItems(list); }, [refreshTick]);
			var focus = useCallback(function (id) {
				setFocused(id);
				// 点击论文行只聚焦/打开右侧详情，不再自动勾选；
				// 勾选仅由行首 checkbox 的 toggleSel 触发。
				setResearchDetail(id); // right-column paper detail
			}, []);
			var toggleSel = useCallback(function (id) {
				setResearchSelection(function (s) {
					var n = Object.assign({}, s);
					if (n[id]) delete n[id]; else n[id] = true;
					return n;
				});
			}, []);
			var clearSel = useCallback(function () { setResearchSelection({}); setFocused(null); }, []);
			var removeSel = useCallback(function (id) {
				setResearchSelection(function (s) { var n = Object.assign({}, s); delete n[id]; return n; });
				setFocused(function (f) { return f === id ? null : f; });
			}, []);
			var selectedPapers = items.filter(function (p) { return sel[p.id]; });
			if (!wide) {
				// 2026-08-19 myf: v2 panel 模式下 wide 强制为 true，不再走窄屏分支；
				// 保留 fallback：若上游忘了传 wide，渲染一个简单的提示而非调 undefined
				return React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 10, color: "var(--dsw-alias-label-secondary, #666)" } },
					React.createElement("span", { style: { fontSize: 12 } }, "研究区就绪"),
				);
			}
			return React.createElement("div", { className: "dsh-rr-wide", style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
				!authReady ? React.createElement("p", { style: S.empty }, "研究区加载中…")
					: React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
						React.createElement(LibraryView, { sel: sel, toggleSel: toggleSel, focus: focus, focused: focused, removeSel: removeSel, onPapers: onPapersCb, openDetails: props.openDetails }),
						// bottom action bar: appears after single/multi selection
						// 2026-08-19 myf: 综述 / 写作 入口已上移至右窗栏 tab，左侧勾选
						// 仅用于批量删除（+ 计数 / 清空选择）。
						Object.keys(sel).length > 0 ? React.createElement("div", { style: S.bar },
							React.createElement("span", { style: S.barLabel }, "已选 " + Object.keys(sel).length + " 篇"),
							// 2026-08-19 myf: 多选批量移动到文件夹（按 projectId 分组，
							// 每个项目用对应的文件夹列表；后端暂无批量接口，所以并行调用单篇 PUT /move）
							React.createElement("button", { style: S.btn, onClick: function () { setDialog({ kind: "movePapers", papers: selectedPapers }); } }, "移动到…"),
							// 2026-08-19 myf: 多选批量删除（确认后并行删除，清空选择并刷新树）
							React.createElement("button", { style: S.btnDanger, onClick: function () { setDialog({ kind: "deletePapers", papers: selectedPapers }); } }, "删除"),
							React.createElement("button", { style: S.iconBtn, title: "清空选择", onClick: clearSel }, React.createElement(IconClose, null)),
						) : null,
						dialog ? React.createElement(DialogForm, { dialog: dialog, projects: treeMeta.projects || [], foldersByProject: treeMeta.foldersByProject || {}, onClose: function () { setDialog(null); }, onDone: function (kind, d) { setDialog(null); if (kind === "deletePapers" || kind === "movePapers") { clearSel(); setRefreshTick(function (t) { return t + 1; }); } } }) : null,
					),
			);
		}

// ── v2 wrapper: DSH 0.1.0-rc.7 真实 slot 体系下的研究区容器 ──
           // 原始 v1 设计使用 4 个不存在的 slot (activitybar / sidebar.research /
           // conversation.details.research / conversation.details.research.title)
           // 全部触发 SlotOwnershipError。v2 改用 DSH 已声明的 `shell.overlay`
           // (list, root scope, kind: list) 注册一个右浮层研究面板，trigger 内
           // 置于组件内（悬浮按钮 + 关闭 X）。所有 React 组件定义、ResearchRegion
           // 行为、API 调用都原样保留；仅重写 apply 注入路径与外层壳。
           // 2026-08-19 myf: v4 —— 三窗栏落地。研究区从 shell.overlay 浮层弹窗
           // 迁入 DSH 真正的右详情列 `details`（single / session scope，由
           // AppFrame 以 grid `sidebar | conversation | details` 三栏渲染）。
           // 左栏文献树点论文 → setResearchDetail → 本列自动打开并展示
           // ResearchDetailPanel（tab 路由：论文详细 / 在线文献检索 / 综述 /
           // 写作）。挂载即 openDetails()，有会话时右栏常驻，与左栏工作区+
           // 文献树、中栏会话形成三窗栏；列头 × 关闭（ctx.layout.closeDetails）。
           // 2026-08-19 myf: ctx 仅在 apply(ctx) 参数作用域可见，模块级组件
           // 函数体内不可直接引用 ctx（ReferenceError: ctx is not defined）。
           // 以模块级 rwsLayout 承接 apply 里的 ctx.layout，组件内用 rwsLayout。
           var rwsLayout = null;
           // 2026-08-20 myf: 承接 ctx.workspaces（DSH workspace 服务）——
           // 订阅 list 可观察「左侧 sidebar 当前选中 workspace」变化，
           // 借此把右侧工作区面板绑到同一根。
           var rwsWorkspaces = null;
			// 2026-08-22 myf: 承接 ctx.sessions（活跃会话定位）与
			// ctx.conversation（拖拽附加 → 会话 draft 注入）。
			var rwsSessions = null;
			var rwsConversation = null;
           function ResearchDetailsColumn() {
                   // 2026-08-20 myf: v6 起默认收起 —— 右窗栏由窗口最右缘 fixed rail
                   // （ResearchRail）控制展开/收起，刚进页面不自动展开。
                   // 下方第二个 effect 保留：左栏点论文 → 自动打开右栏详情。
                   // 左栏 / 任何来源的论文选择 → 确保右栏打开
                   useEffect(function () {
                           return subscribeResearchDetail(function (rd) {
                                   if (rd.paperId == null) return;
                                   try { rwsLayout.openDetails(); } catch (e) { }
                           });
                   }, []);
                   var closeDetails = function () {
                           try { rwsLayout.closeDetails(); } catch (e) { }
                   };
                   // 2026-08-21 myf: 列头标题跟随当前 tab —— 工作区栏目时显示
                   // 「工作区」（与 rail 按钮标签一致），否则「研究区」。
                   var [wsTab, setWsTab] = useState(researchPanelTab.kind);
                   useEffect(function () { return subscribeResearchPanelTab(setWsTab); }, []);
                   var colTitle = wsTab === "workspace" ? "工作区" : "研究区";
                   // 2026-08-20 myf: v6 —— 右侧竖栏已上移为窗口最右缘 fixed rail
                   // （ResearchRail，apply 里 createRoot 挂到 body），details 列恢复
                   // 纯内容列。rail 让位已由 apply 注入的 frame padding-right 承担，
                   // 内容仅保留 16px 内边距。
                   return React.createElement("div", { style: { height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--dsw-alias-bg-layer-1, #1a1a1a)", color: "var(--dsw-alias-label-primary, #e6e6e6)" } },
                           React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08))", flex: "none" } },
                                   React.createElement("span", { style: { fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 } }, colTitle),
                                   React.createElement("button", {
                                           type: "button",
                                           title: "关闭" + colTitle,
                                           ariaLabel: "关闭" + colTitle,
                                           style: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 8px", borderRadius: 6 },
                                           onClick: closeDetails,
                                   }, "×"),
                           ),
                           React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "0 16px 16px", boxSizing: "border-box" } },
                                   React.createElement(ResearchDetailPanel, null),
                           ),
                   );
           }

           // 2026-08-19 myf: v4 注入路径 —— 三窗栏。
           // 1) sidebar.workspaces.research —— 文献目录树，与工作区列表同列
           //    （由 ui-workspace 声明的 single/root 子 slot）。
           // 2) details —— 右详情列（single/session scope，AppFrame grid
           //    三栏），展示论文详细 / 在线文献检索 / 综述 / 写作工作台。
           //    左栏点论文 → setResearchDetail → 右栏自动打开。
           // 2026-08-19 myf: inject 需含 "layout"（DSH 服务注入声明），
           // 否则 ctx.layout 为 undefined，openDetails/closeDetails 调用
           // 抛 TypeError 被吞，details 列永远 0 宽（openDetails 不生效）。
           // ── 拖拽附加：研究区论文 / 工作区文件 → 会话输入框 ──────────────────
           // 2026-08-22 myf: DSH 附件管道仅支持图片（service.ts imageMediaType
           // 白名单），代码/PDF 走标准 onAddImages 会抛 UnsupportedImageMediaTypeError。
           // 方案：自定义 drag type，拖入 composer（data-composer-card）时抓取内容/
           // 元数据，以文本块注入当前会话 draft（prompt parts 支持 {type:'text'}）。
           // 注入目标 = rwsSessions.list.current → scope(id).conversation.input.for(actx)。
           var RWS_DROP_TYPE = "application/x-research-attach";

           function installResearchDrop() {
           	if (window.__rwsDropInstalled) return;
           	window.__rwsDropInstalled = true;

           	function rwsDropPayload(e) {
           		var dt = e.dataTransfer;
           		if (!dt || !dt.types) return null;
           		var hit = false;
           		for (var i = 0; i < dt.types.length; i++) {
           			if (dt.types[i] === RWS_DROP_TYPE) { hit = true; break; }
           		}
           		if (!hit) return null;
           		try { return JSON.parse(dt.getData(RWS_DROP_TYPE)); }
           		catch (err) { return null; }
           	}
           	function rwsComposerCard(e) {
           		var t = e.target;
           		while (t && t.nodeType === 1) {
           			if (t.hasAttribute && t.hasAttribute("data-composer-card")) return t;
           			t = t.parentElement;
           		}
           		return null;
           	}
           	function rwsClearDrop() {
           		var card = document.querySelector("[data-composer-card].dsh-rws-drop");
           		if (card) card.classList.remove("dsh-rws-drop");
           	}
           	// 拖入 composer 高亮 + 允许 drop（自定义 type 不走 ComposerAttachments
           	// 的 Files 检查，默认 dragover 会拒绝落点，必须自行 preventDefault）
           	document.addEventListener("dragover", function (e) {
           		var p = rwsDropPayload(e);
           		if (!p) return;
           		var card = rwsComposerCard(e);
           		if (!card) return;
           		e.preventDefault();
           		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
           		card.classList.add("dsh-rws-drop");
           	});
           	document.addEventListener("dragleave", function (e) {
           		if (!rwsDropPayload(e)) return;
           		if (!rwsComposerCard(e)) rwsClearDrop();
           	});
           	document.addEventListener("drop", function (e) {
           		var p = rwsDropPayload(e);
           		if (!p) return;
           		var card = rwsComposerCard(e);
           		if (!card) return;
           		e.preventDefault();
           		e.stopPropagation();
           		rwsClearDrop();
           		rwsHandleAttach(p);
           	});
           	document.addEventListener("dragend", rwsClearDrop);
           	// composer 高亮样式（独立 style 标签，防 HMR 重复注入）
           	if (!document.head.querySelector('style[data-rws-drop="1"]')) {
           		var dropStyle = document.createElement("style");
           		dropStyle.setAttribute("data-rws-drop", "1");
           		dropStyle.textContent = "[data-composer-card].dsh-rws-drop { box-shadow: 0 0 0 2px var(--dsw-alias-accent, #4f8cff) inset, 0 0 0 3px rgba(79, 140, 255, 0.3); border-radius: 12px; transition: box-shadow 0.12s ease; }";
           		document.head.appendChild(dropStyle);
           	}

           	function rwsHandleAttach(payload) {
           		var sessSnap = rwsSessions && rwsSessions.list ? rwsSessions.list.getSnapshot() : null;
           		var sid = sessSnap ? sessSnap.current : undefined;
           		if (sid === undefined) return;
           		var scoped = rwsSessions.scope(sid);
           		if (!scoped) return;
           		var conv = rwsConversation;
           		if (!conv || !conv.input) return;
           		var input = conv.input.for(scoped);
           		if (payload.kind === "file") rwsAttachFile(input, payload);
           		else if (payload.kind === "paper") rwsAttachPaper(input, payload);
           	}
           	// 拖拽附加 → 附件卡片：注册文件附件并加入当前会话输入（而非拼进 draft）。
           	// 回退：附件管道不可用时退回文本注入（旧路径），保证功能不丢失。
           	function rwsAttachAsFile(input, label, text, meta) {
           		var conv = rwsConversation;
           		if (conv && typeof conv.createDraftFiles === "function" && typeof input.addFiles === "function") {
           			var entry = { name: label, text: text };
           			if (meta) entry.meta = meta;
           			var files = conv.createDraftFiles([entry]);
           			if (input.addFiles(files.map(function (f) { return f.id; }))) {
           				try { input.notify("info", "已附加到会话输入"); } catch (err) { /* 通知失败不阻塞 */ }
           				return;
           			}
           			for (var i = 0; i < files.length; i++) conv.releaseDraftFile(files[i].id);
           			return;
           		}
           		var st = input.state ? input.state.getSnapshot() : null;
           		var draft = st ? (st.draft || "") : "";
           		var body = label + "\n" + text;
           		input.setDraft(draft.trim() ? draft + "\n\n" + body : body);
           		try { input.notify("info", "已附加到会话输入"); } catch (err) { /* 通知失败不阻塞 */ }
           	}
           	// 工作区文件：抓内容 → 文本块注入（二进制/图片/PDF 只放引用）
           	function rwsAttachFile(input, payload) {
           		var path = payload.path || "";
           		var root = payload.root || "";
           		var url = "/research-workspace/content?path=" + encodeURIComponent(path);
           		if (root) url += "&root=" + encodeURIComponent(root);
           		fetch(url, { credentials: "include" }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
           			var label = "[工作区文件] " + path + (root ? "（" + root + "）" : "");
           			if (!j || j.code !== 0 || !j.data) {
           				rwsAttachAsFile(input, label, "（内容读取失败，请让智能体使用工作区工具查看该文件）", { kind: "file", root: root, path: path });
           				return;
           			}
           			var d = j.data;
           			if (d.kind === "image" || d.kind === "pdf" || d.kind === "binary" || d.base64) {
           				rwsAttachAsFile(input, label, "（" + (d.mime || d.kind || "文件") + "，二进制内容无法内嵌，请让智能体使用工作区工具读取）", { kind: "file", root: root, path: path });
           				return;
           			}
           			var text = d.text || "";
           			if (d.truncated) text += "\n…（文件过大，仅显示前 5MB，可让智能体使用工作区工具分段读取）";
           			rwsAttachAsFile(input, label, text, { kind: "file", root: root, path: path });
           		}).catch(function () {
           			rwsAttachAsFile(input, "[工作区文件] " + path, "（内容读取失败，请让智能体使用工作区工具查看该文件）", { kind: "file", root: root, path: path });
           		});
           	}
           	// 研究区论文：查详情拿 pdfUrl，注入引用（智能体经 literature_get 阅读）
           	function rwsAttachPaper(input, payload) {
           		var id = payload.id;
           		var title = payload.title || "(untitled)";
           		var block = title + "（论文 #" + id + "）\n请使用文献工具 mcp__research__literature_get 阅读该论文（参数 paper_id=" + id + "）。";
           		fetch("/research-paper/papers/" + encodeURIComponent(id), { credentials: "include" }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
           			var key = (j && j.code === 0 && j.data && j.data.pdfUrl) ? j.data.pdfUrl : null;
           			// 2026-08-22 myf: pdfUrl 为完整外链（http(s)://）时原样展示，本地文件是 key 才拼前缀
			var pdfRef = key && /^https?:\/\//i.test(key) ? key : (key ? "/research-file/files/" + key : null);
			var body = block;
           			if (pdfRef) body += "\nPDF 文件：" + pdfRef;
           			rwsAttachAsFile(input, "[研究区论文] " + title + "（论文 #" + id + "）", body, { kind: "paper", paperId: id });
           		}).catch(function () {
           			rwsAttachAsFile(input, "[研究区论文] " + title + "（论文 #" + id + "）", block, { kind: "paper", paperId: id });
           		});
           	}
           }

           // 设置 → 研究区大模型：按用户配置 LLM 与 Embedding（Base URL / 模型 / Key）。
           // 保存到后端 /research-settings（PATCH → SQLite app_user.settings.research）：
           //   research.llm       = 大模型论文解析（baseUrl / apiKey / model）
           //   research.embedding = 嵌入向量（baseUrl / apiKey / model）
           // apiKey 输入为 password 型，保存后不回显（留空 = 保持原值）。
           function ResearchModelSettings(props) {
                   var [draft, setDraft] = useState({ llm: {}, embedding: {} });
                   var [loading, setLoading] = useState(true);
                   var [saving, setSaving] = useState(false);
                   var [msg, setMsg] = useState("");   // 保存成功提示
                   var [err, setErr] = useState("");   // 错误提示
                   function load() {
                           api("/research-settings").then(function (j) {
                                   if (ok(j)) {
                                           var r = (j.data && j.data.research) || {};
                                           var llm = (r.llm && typeof r.llm === "object") ? r.llm : {};
                                           var emb = (r.embedding && typeof r.embedding === "object") ? r.embedding : {};
                                           // apiKey 不回显，仅回填 baseUrl/model
                                           setDraft({ llm: { baseUrl: llm.baseUrl || "", model: llm.model || "" }, embedding: { baseUrl: emb.baseUrl || "", model: emb.model || "" } });
                                           setErr("");
                                   } else {
                                           setErr(j.message || "加载设置失败");
                                   }
                           }).catch(function () { setErr("加载设置失败"); }).then(function () { setLoading(false); });
                   }
                   useEffect(function () { load(); }, []);
                   function setField(section, field, value) {
                           setDraft(function (d) {
                                   var s2 = Object.assign({}, d[section]);
                                   s2[field] = value;
                                   var n = Object.assign({}, d);
                                   n[section] = s2;
                                   return n;
                           });
                   }
                   function save() {
                           setSaving(true); setMsg(""); setErr("");
                           // 只提交非空 apiKey（空 = 保持原值）；baseUrl/model 原样提交
                           function build(section) {
                                   var d = draft[section] || {};
                                   var out = {};
                                   if (d.baseUrl) out.baseUrl = d.baseUrl;
                                   if (d.model) out.model = d.model;
                                   if (d.apiKey && d.apiKey.trim()) out.apiKey = d.apiKey.trim();
                                   return out;
                           }
                           var patch = { research: { llm: build("llm"), embedding: build("embedding") } };
                           api("/research-settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then(function (j) {
                                   setSaving(false);
                                   if (ok(j)) {
                                           setMsg("已保存");
                                           // 清空 apiKey 输入框（不回显），刷新 baseUrl/model 回填
                                           var r = (j.data && j.data.research) || {};
                                           var llm = (r.llm && typeof r.llm === "object") ? r.llm : {};
                                           var emb = (r.embedding && typeof r.embedding === "object") ? r.embedding : {};
                                           setDraft({ llm: { baseUrl: llm.baseUrl || "", model: llm.model || "" }, embedding: { baseUrl: emb.baseUrl || "", model: emb.model || "" } });
                                           setTimeout(function () { setMsg(""); }, 2500);
                                   } else {
                                           setErr(j.message || "保存失败");
                                   }
                           }).catch(function () { setSaving(false); setErr("保存失败"); });
                   }
                   var card = {
                           border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))",
                           borderRadius: 10,
                           padding: "16px 18px",
                           background: "var(--dsw-alias-bg-layer-1, #fff)",
                           display: "flex", flexDirection: "column", gap: 12,
                   };
                   var fieldLabel = { fontSize: 12, lineHeight: "16px", color: "var(--dsw-alias-label-secondary, #666)" };
                   var blockTitle = { fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #111)" };
                   var blockDesc = { fontSize: 12, lineHeight: "16px", color: "var(--dsw-alias-label-tertiary, #999)" };
                   function fieldRow(label, value, onChange, placeholder, password) {
                           return React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                                   React.createElement("span", { style: fieldLabel }, label),
                                   React.createElement("input", { type: password ? "password" : "text", style: Object.assign({}, S.finput, { height: 32 }), value: value, placeholder: placeholder || "", spellCheck: false, onChange: function (e) { onChange(e.target.value); } }),
                           );
                   }
                   return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, padding: "18px 20px 28px", minHeight: 0, overflowY: "auto", flex: 1 } },
                           React.createElement("div", null,
                                   React.createElement("p", { style: blockTitle }, "研究区大模型"),
                                   React.createElement("p", { style: Object.assign({}, blockDesc, { marginTop: 2 }) }, "配置论文解析（Paper Card）、综述与写作使用的大模型，以及嵌入向量模型。保存后 AI 任务按此配置执行，留空则使用系统默认。"),
                           ),
                           React.createElement("div", { style: card },
                                   React.createElement("div", null,
                                           React.createElement("p", { style: blockTitle }, "大模型（LLM）"),
                                           React.createElement("p", { style: Object.assign({}, blockDesc, { marginTop: 2 }) }, "用于 Paper Card 解析、综述生成与论文写作。OpenAI 兼容端点（火山引擎 / 豆包 / 自建网关均可）。"),
                                   ),
                                   fieldRow("Base URL", draft.llm.baseUrl, function (v) { setField("llm", "baseUrl", v); }, "https://api.deepseek.com/v1"),
                                   fieldRow("模型名称", draft.llm.model, function (v) { setField("llm", "model", v); }, "deepseek-chat"),
                                   fieldRow("API Key", draft.llm.apiKey || "", function (v) { setField("llm", "apiKey", v); }, "留空则保持已保存的 Key", true),
                           ),
                           React.createElement("div", { style: card },
                                   React.createElement("div", null,
                                           React.createElement("p", { style: blockTitle }, "嵌入向量模型（Embedding）"),
                                           React.createElement("p", { style: Object.assign({}, blockDesc, { marginTop: 2 }) }, "用于论文切片的向量检索（RAG）。"),
                                   ),
                                   fieldRow("Base URL", draft.embedding.baseUrl, function (v) { setField("embedding", "baseUrl", v); }, "https://api.deepseek.com/v1"),
                                   fieldRow("模型名称", draft.embedding.model, function (v) { setField("embedding", "model", v); }, "embedding-v3"),
                                   fieldRow("API Key", draft.embedding.apiKey || "", function (v) { setField("embedding", "apiKey", v); }, "留空则保持已保存的 Key", true),
                           ),
                           React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                                   // 2026-08-20 myf: 保存按钮配色与「综述 → 生成综述」保持一致（S.btn，
                                   // elevated-fill 浅底 + 1px 边框阴影），研究区内操作按钮统一外观。
                                   React.createElement("button", { type: "button", style: S.btn, disabled: saving, onClick: save }, saving ? "保存中…" : "保存"),
                                   msg ? React.createElement("span", { style: { fontSize: 12, color: "var(--dsw-alias-state-success-primary, #16a34a)" } }, msg) : null,
                                   err ? React.createElement("span", { style: Object.assign({}, S.err, { padding: 0 }) }, err) : null,
                           ),
                           loading ? React.createElement("p", { style: S.empty }, "加载设置…") : null,
                   );
           }

           var railRoot = null;
           exports.inject = ["slots", "layout", "workspaces", "sessions", "conversation"];
           exports.apply = function (ctx) {
                   // 2026-08-19 myf: 承接 ctx.layout 到模块级引用（组件函数体内
                   // 无 ctx）。ctx.layout 由 ui-layout 插件 reflect.provide 提供，
                   // inject 声明保证 apply 时已就绪。
                   rwsLayout = ctx.layout;
                   rwsWorkspaces = ctx.workspaces;
                   // 2026-08-21 myf: 承接 ctx.sessions —— 切换工作区时
                   // recentWorkspaceId 不变，可靠信号是 sessions.list.current。
                   rwsSessions = ctx.sessions;
					// 2026-08-22 myf: 承接 ctx.conversation（root 注册，drop 注入用）
					rwsConversation = ctx.conversation;
                   // 2026-08-22 myf: 安装拖拽附加（研究区论文 / 工作区文件 → 会话输入框），幂等防 HMR 重复。
                   installResearchDrop();
                   // 2026-08-20 myf: 窗口最右缘固定竖栏（IDEA tool-window rail，
                   // position:fixed 脱离 AppFrame grid）。用 react-dom/client
                   // createRoot 挂到 document.body，点击「研究区」展开/收起
                   // details 列。幂等：HMR 重复 apply 时 railRoot 已存在则跳过。
                   if (!railRoot) {
                           try {
                                   var ReactDOMClient = require("react-dom/client");
                                   var railHost = document.getElementById("research-railbar");
                                   if (!railHost) {
                                           railHost = document.createElement("div");
                                           railHost.id = "research-railbar";
                                           document.body.appendChild(railHost);
                                   }
                                   railRoot = ReactDOMClient.createRoot(railHost);
                                   railRoot.render(React.createElement(ResearchRail, null));
                           } catch (e) { /* rail 挂载失败不阻塞主功能 */ }
                   }
                   // 2026-08-20 myf: rail 常驻窗口最右缘（fixed 46px），给 AppFrame
                   // 根 grid 容器让位 46px（padding-right + border-box），否则
                   // details 列收起时会话区最右 46px 被 rail 遮挡。用
                   // [class$="_frame"] 匹配 ui-layout css-modules 哈希类名
                   // （dIvAdG_frame），不依赖具体哈希前缀；data 标记防重复注入。
                   if (!document.head.querySelector('style[data-rws-rail="1"]')) {
                           var railStyle = document.createElement("style");
                           railStyle.setAttribute("data-rws-rail", "1");
                           railStyle.textContent = "[class$='_frame'] { padding-right: 46px; box-sizing: border-box; }";
                           document.head.appendChild(railStyle);
                   }
                   // 左侧边栏文献目录：复用 ResearchRegion（含项目树 + 论文列表 +
                   // 搜索 + 新建项目）。点击论文行 → setResearchDetail → 右侧
                   // details 列自动打开详情（ResearchDetailsColumn 订阅）。
                   // 2026-08-19 myf: 从 sidebar.workspaces.research（工作区浏览器
                   // 内部子槽位）改注册 sidebar.research（ui-sidebar 侧边栏级槽位，
                   // SidebarRoot regionLower 渲染），实现左侧工作区/研究区对半分。
                   ctx.slots.inject("sidebar.research", function () {
                           return ctx.slots.register({
                                   name: "sidebar.research",
                                   id: "research-library",
                                   label: "研究区",
                           }, function (props) {
                                   return React.createElement("div", { className: "rws-sidebar", style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
                                           React.createElement(ResearchRegion, { wide: true }));
                           });
                   });
                   // 右侧详情列：研究区工作台（替代 DSH 自带会话工具详情列）。
                   // single slot 已被 ui-conversation 的 DetailsPanel 以 priority 0
                   // 占用；按 DSH 规则 lowest renders，用更低的 priority shadow 它。
                   ctx.slots.inject("details", function () {
                           return ctx.slots.register({
                                   name: "details",
                                   id: "research-details",
                                   priority: -100,
                                   label: "研究区",
                           }, ResearchDetailsColumn);
                   });
                   // 2026-08-22 myf: 注册「设置 → 研究区大模型」页面（settings.section
                   // list slot，order 20 紧随模型页 order 10）。label 用 thunk 形式
                   //（与 ui-settings-models 一致）；组件自绘表单并直连 /research-settings。
                   ctx.slots.inject("settings.section", function () {
                           return ctx.slots.register({
                                   name: "settings.section",
                                   id: "research-models",
                                   order: 20,
                                   label: function () { return "研究区大模型"; },
                           }, ResearchModelSettings);
                   });
           };

                return module.exports;
        }
});
