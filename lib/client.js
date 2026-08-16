// dsh-settings-nav-fold — 设置面板导航折叠（浏览器端插件包）
// 在设置面板左侧导航列表中，于「系统配置」各项正下方插入一个带下拉箭头的
// 「插件入口 (N)」分组行；默认折叠，点击展开/收起所有插件设置入口，
// 并随 settings.section 台账变化自动更新计数与折叠位置。
window.__ModuleLoader__.load({
	id: "dsh-settings-nav-fold",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		/** Services required by the settings-nav-fold plugin. */
		const inject = ["slots", "locale"];

		/**
		 * Apply the settings nav folding.
		 * @param ctx - Client root context.
		 */
		function apply(ctx) {
			const NS = "settings-nav";
			// 内置核心设置页，始终平铺；其余入口（插件/扩展）折叠进分组
			const CORE = new Set(["general", "models", "plugins", "agent-presets"]);

			ctx.effect(() => ctx.locale.register(NS, "zh", {
				plugins: "插件入口",
				expand: "展开插件入口",
				collapse: "收起插件入口"
			}), "settings-nav: zh dictionary");
			ctx.effect(() => ctx.locale.register(NS, "en", {
				plugins: "Plugin entries",
				expand: "Expand plugin entries",
				collapse: "Collapse plugin entries"
			}), "settings-nav: en dictionary");
			const t = ctx.locale.bind(NS);

			const state = { folded: true, count: 0 };
			let rows = [];
			// 重入防护：sync() 执行期间忽略后续的观察器回调，
			// 避免我们自己的 DOM 写入再次触发 sync（反馈循环）。
			let inSync = false;
			// 只在实际内容变化时才写 textContent；textContent 赋值会无条件
			// 替换子文本节点（childList 突变），若每次回调都写，就会触发
			// 自身 MutationObserver 的无限反馈循环。
			const setText = (el, value) => {
				if (el.textContent !== value) el.textContent = value;
			};

			// 折叠规则样式表：列表标记为折叠时隐藏插件按钮；当前激活项始终可见。
			// 折叠状态放在导航列表的 data 属性上，样式为常量。
			const tag = document.createElement("style");
			tag.dataset.settingsNavFold = "1";
			tag.textContent = [
				'[role="dialog"][aria-modal="true"] > nav > div:last-child[data-snav-folded="1"] > button[data-snav-plugin="1"]{display:none}',
				'[role="dialog"][aria-modal="true"] > nav > div:last-child[data-snav-folded="1"] > button[data-snav-plugin="1"][aria-current="true"]{display:flex}',
				".dsh-snav-chip{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;width:100%;height:40px;padding:9px 16px 9px 12px;border:none;border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary,#999);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}",
				".dsh-snav-chip:hover{background:var(--dsw-specific-sidebar-nav-item-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#333)}",
				".dsh-snav-chevron{flex:none;font-size:10px;opacity:.75}"
			].join("\n");
			ctx.effect(() => {
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "settings-nav: fold rules");

			const FOLD_SEL = '[role="dialog"][aria-modal="true"] > nav > div:last-child';
			const findNavList = () => document.querySelector(FOLD_SEL);

			// 分组表头行：<插件入口 (N)  ▾>，插入到最后一个系统配置项之后
			const header = document.createElement("button");
			header.type = "button";
			header.className = "dsh-snav-chip";
			const label = document.createElement("span");
			const chevron = document.createElement("span");
			chevron.className = "dsh-snav-chevron";
			header.appendChild(label);
			header.appendChild(chevron);
			const updateHeader = () => {
				setText(label, `${t("plugins")} (${state.count})`);
				setText(chevron, state.folded ? "▾" : "▴");
				header.title = state.folded ? t("expand") : t("collapse");
				header.setAttribute("aria-expanded", String(!state.folded));
				header.style.display = state.count > 0 ? "" : "none";
			};
			header.addEventListener("click", () => {
				state.folded = !state.folded;
				sync();
				updateHeader();
			});

			// 标记插件按钮 + 把表头行放到正确位置；幂等，位置正确时不改动 DOM
			const sync = () => {
				if (inSync) return;
				inSync = true;
				try {
					const navList = findNavList();
					if (navList === null) return;
					let buttonIndex = 0;
					let lastCoreAt = -1;
					for (const child of navList.children) {
						if (child === header || child.tagName !== "BUTTON") continue;
						const row = rows[buttonIndex];
						buttonIndex += 1;
						const isPlugin = row !== undefined && !CORE.has(row.id);
						if (isPlugin) child.dataset.snavPlugin = "1";
						else delete child.dataset.snavPlugin;
						if (!isPlugin) lastCoreAt = buttonIndex - 1;
					}
					if (state.folded) navList.dataset.snavFolded = "1";
					else delete navList.dataset.snavFolded;
					const others = [...navList.children].filter((c) => c !== header);
					const ref = lastCoreAt >= 0 ? others[lastCoreAt].nextSibling : navList.firstChild;
					const placed = header.parentNode === navList && (ref === null ? header.nextSibling === null : header === ref || header.nextSibling === ref);
					if (!placed) navList.insertBefore(header, ref);
					updateHeader();
				} finally {
					inSync = false;
				}
			};

			// 台账变化（插件增删设置页）→ 重算分组并同步
			const refresh = () => {
				rows = ctx.slots.entries("settings.section")
					.map((e) => ({ id: e.options.id ?? "", order: e.options.order ?? 0 }))
					.sort((a, b) => a.order - b.order);
				state.count = rows.filter((r) => !CORE.has(r.id)).length;
				sync();
			};
			ctx.effect(() => ctx.slots.subscribe("settings.section", refresh), "settings-nav: section ledger watch");
			ctx.effect(() => ctx.locale.subscribe(() => updateHeader()), "settings-nav: locale watch");

			// 面板打开 / React 重渲染导航列表时重新注入表头与标记。
			// 忽略我们自己 chip 子树内的突变（updateHeader 写 textContent 会
			// 替换文本节点，若不忽略会形成自我触发的无限反馈循环）。
			const observer = new MutationObserver((mutations) => {
				if (mutations.some((m) => m.target instanceof Element && m.target.closest?.(".dsh-snav-chip"))) return;
				sync();
			});
			observer.observe(document.body, { childList: true, subtree: true });
			ctx.effect(() => () => {
				observer.disconnect();
				header.remove();
			}, "settings-nav: dom observer cleanup");

			refresh();
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
