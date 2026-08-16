// dsh-settings-nav-fold — 设置面板导航整理（浏览器端插件包）
// 1) 折叠：把插件/扩展的设置入口折叠为一个可展开的「插件入口」分组行；
// 2) 书签式自定义分组：可创建命名分组，把任意设置入口归入分组，
//    导航中每个分组像书签文件夹一样可展开/收起（localStorage 持久化），
//    并提供「分组管理」页（设置面板条目）进行书签式管理。
window.__ModuleLoader__.load({
	id: "dsh-settings-nav-fold",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");

		const STORAGE_KEY = "dsh.settingsNavFold.v1";

		/** Services required by the settings-nav-fold plugin. */
		const inject = ["slots", "locale"];

		// 单实例守卫：同一页面重复激活（异常路径）会让两套观察器/注入行互相
		// 打架并形成 DOM 风暴，直接忽略后续激活。
		var ACTIVE = false;

		/**
		 * Apply the settings nav folding + bookmark-style custom groups.
		 * @param ctx - Client root context.
		 */
		function apply(ctx) {
			if (ACTIVE) {
				console.warn("[settings-nav-fold] already active — ignoring duplicate apply");
				return;
			}
			ACTIVE = true;
			ctx.effect(() => () => {
				ACTIVE = false;
			}, "settings-nav: single-instance guard");
			const NS = "settings-nav";
			console.log("[settings-nav-fold] v1.1.1 loaded");
			// 始终平铺的内置项：核心设置页 + 本插件的「分组管理」页
			const CORE = new Set(["general", "models", "plugins", "agent-presets", "settings-nav-groups"]);

			ctx.effect(() => ctx.locale.register(NS, "zh", {
				plugins: "插件入口",
				expand: "展开",
				collapse: "收起",
				groups: "分组管理",
				newGroup: "新建分组",
				groupName: "分组名称",
				rename: "重命名",
				delete: "删除",
				remove: "移出",
				addToGroup: "移入分组",
				ungrouped: "未分组",
				noGroups: "还没有分组——在下方输入名称新建一个，然后像管理书签一样把设置入口拖进分组。",
				empty: "（空）",
			}), "settings-nav: zh dictionary");
			ctx.effect(() => ctx.locale.register(NS, "en", {
				plugins: "Plugin entries",
				expand: "Expand",
				collapse: "Collapse",
				groups: "Groups",
				newGroup: "New group",
				groupName: "Group name",
				rename: "Rename",
				delete: "Delete",
				remove: "Remove",
				addToGroup: "Move to group",
				ungrouped: "Ungrouped",
				noGroups: "No groups yet — create one below, then organize entries like bookmarks.",
				empty: "(empty)",
			}), "settings-nav: en dictionary");
			const t = ctx.locale.bind(NS);

			// ---- 持久化分组配置（localStorage）----
			const loadGroups = () => {
				try {
					const raw = localStorage.getItem(STORAGE_KEY);
					if (raw === null) return [];
					const data = JSON.parse(raw);
					if (!Array.isArray(data.groups)) return [];
					return data.groups
						.filter((g) => g && typeof g.id === "string" && typeof g.name === "string" && Array.isArray(g.entries))
						.map((g) => ({ id: g.id, name: g.name, entries: g.entries.filter((x) => typeof x === "string") }));
				} catch (_ignored) {
					return [];
				}
			};
			const saveGroups = () => {
				try {
					localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups: state.groups }));
				} catch (_ignored) {
					/* storage unavailable: keep in-memory only */
				}
			};

			// 运行状态：folded=未分组入口是否折叠；groups=自定义分组；open=各分组展开态（会话内）
			const state = { folded: true, count: 0, groups: loadGroups(), open: {} };
			let rows = []; // {id, order, label}
			let nextGroupId = 1;
			for (const g of state.groups) nextGroupId = Math.max(nextGroupId, Number(g.id) + 1);

			const resolveLabel = (l) => (typeof l === "function" ? l() : (l ?? ""));
			const groupOf = (entryId) => {
				for (const g of state.groups) if (g.entries.includes(entryId)) return g.id;
				return undefined;
			};

			// ---- 样式表（动态重建：未分组折叠规则 + 每个自定义分组一条显隐规则）----
			const tag = document.createElement("style");
			tag.dataset.settingsNavFold = "1";
			const FOLD_SEL = '[role="dialog"][aria-modal="true"] > nav > div:last-child';
			const applyRules = () => {
				const parts = [
					`${FOLD_SEL}[data-snav-folded="1"] > button[data-snav-plugin="1"]{display:none}`,
					`${FOLD_SEL}[data-snav-folded="1"] > button[data-snav-plugin="1"][aria-current="true"]{display:flex}`,
					".dsh-snav-chip{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;width:100%;height:40px;padding:9px 16px 9px 12px;border:none;border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary,#999);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}",
					".dsh-snav-chip:hover{background:var(--dsw-specific-sidebar-nav-item-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#333)}",
					".dsh-snav-chevron{flex:none;font-size:10px;opacity:.75}",
					".dsh-snav-page{display:flex;flex-direction:column;gap:14px;width:100%;max-width:560px}",
					".dsh-snav-new{display:flex;gap:8px;align-items:center}",
					".dsh-snav-input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#eee);font-family:inherit;font-size:13px}",
					".dsh-snav-btn{height:32px;padding:0 12px;border:none;border-radius:8px;background:var(--dsw-specific-sidebar-nav-item-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#eee);font-family:inherit;font-size:13px;cursor:pointer}",
					".dsh-snav-btn:hover{filter:brightness(1.12)}",
					".dsh-snav-mini{height:24px;padding:0 8px;font-size:12px}",
					".dsh-snav-danger{color:var(--dsw-alias-state-error-primary,#e5484d)}",
					".dsh-snav-gcard{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l1,transparent)}",
					".dsh-snav-ghead{display:flex;align-items:center;gap:8px}",
					".dsh-snav-gname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,#eee)}",
					".dsh-snav-gitems{display:flex;flex-direction:column;gap:4px;padding-left:4px}",
					".dsh-snav-item{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:8px}",
					".dsh-snav-item:hover{background:var(--dsw-specific-sidebar-nav-item-hover,rgba(127,127,127,.1))}",
					".dsh-snav-itemname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--dsw-alias-label-primary,#eee)}",
					".dsh-snav-select{height:26px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#eee);font-family:inherit;font-size:12px}",
					".dsh-snav-hint{color:var(--dsw-alias-label-secondary,#999);font-size:12px}",
					".dsh-snav-ung{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;border:1px dashed var(--dsw-alias-border-l2,transparent)}",
				];
				for (const g of state.groups) {
					parts.push(`${FOLD_SEL} > button[data-snav-group="${g.id}"]{display:none}`);
					parts.push(`${FOLD_SEL}[data-snav-open-${g.id}="1"] > button[data-snav-group="${g.id}"]{display:flex}`);
				}
				parts.push(`${FOLD_SEL} > button[data-snav-group][aria-current="true"]{display:flex}`);
				const css = parts.join("\n");
				if (tag.textContent !== css) tag.textContent = css;
			};
			ctx.effect(() => {
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "settings-nav: fold rules");

			const findNavList = () => document.querySelector(FOLD_SEL);
			// 只在实际内容变化时才写 textContent，避免自身 MutationObserver 反馈循环
			const setText = (el, value) => {
				if (el.textContent !== value) el.textContent = value;
			};

			// ---- 注入行：每个自定义分组一行 + 未分组「插件入口」一行 ----
			const groupRows = new Map(); // gid -> element
			let pluginsRow = null;

			const makeRow = (kind, gid) => {
				const el = document.createElement("button");
				el.type = "button";
				el.className = "dsh-snav-chip";
				el.dataset.snavRow = kind;
				if (gid !== undefined) el.dataset.snavGid = gid;
				const label = document.createElement("span");
				const chevron = document.createElement("span");
				chevron.className = "dsh-snav-chevron";
				el.appendChild(label);
				el.appendChild(chevron);
				el.addEventListener("click", () => {
					if (kind === "group") state.open[gid] = !state.open[gid];
					else state.folded = !state.folded;
					sync();
				});
				return el;
			};

			const updateRow = (el, kind, gid) => {
				if (el === null) return;
				const group = kind === "group" ? state.groups.find((g) => g.id === gid) : undefined;
				const isOpen = kind === "group" ? state.open[gid] === true : !state.folded;
				const name = kind === "group" ? (group?.name ?? "") : t("plugins");
				const count = kind === "group"
					? (group?.entries.filter((id) => rows.some((r) => r.id === id)).length ?? 0)
					: state.count;
				setText(el.firstChild, `${name} (${count})`);
				setText(el.lastChild, isOpen ? "▴" : "▾");
				el.title = isOpen ? t("collapse") : t("expand");
				el.setAttribute("aria-expanded", String(isOpen));
				el.style.display = count > 0 ? "" : "none";
			};

			// 重入防护：sync() 执行期间忽略后续观察器回调，避免反馈循环
			let inSync = false;

			// 标记原生按钮 + 对齐注入行；幂等，位置正确时不改动 DOM
			const sync = () => {
				if (inSync) return;
				inSync = true;
				try {
					// 未分组（插件入口兜底）计数随分组配置实时重算
					state.count = rows.filter((r) => !CORE.has(r.id) && groupOf(r.id) === undefined).length;
					const navList = findNavList();
					if (navList === null) return;
					// 1) 给每个原生按钮打标记：CORE=无 / 有分组=组 id / 未分组=插件入口
					const injected = new Set([...groupRows.values(), pluginsRow].filter(Boolean));
					const coreEls = [];
					let buttonIndex = 0;
					for (const child of navList.children) {
						if (injected.has(child) || child.tagName !== "BUTTON") continue;
						const row = rows[buttonIndex];
						buttonIndex += 1;
						if (row === undefined) continue;
						const gid = groupOf(row.id);
						if (CORE.has(row.id)) {
							delete child.dataset.snavPlugin;
							delete child.dataset.snavGroup;
							coreEls.push(child);
						} else if (gid !== undefined) {
							child.dataset.snavGroup = gid;
							delete child.dataset.snavPlugin;
						} else {
							child.dataset.snavPlugin = "1";
							delete child.dataset.snavGroup;
						}
					}
					// 2) 折叠标记
					if (state.folded) navList.dataset.snavFolded = "1";
					else delete navList.dataset.snavFolded;
					for (const g of state.groups) {
						if (state.open[g.id]) navList.dataset[`snavOpen${g.id}`] = "1";
						else delete navList.dataset[`snavOpen${g.id}`];
					}
					// 3) 注入行对齐：分组行（按配置顺序）+ 插件入口行（未分组>0 时），
					//    统一排在最后一个核心项之后
					const wantedGids = state.groups.map((g) => g.id);
					for (const [gid, el] of [...groupRows]) {
						if (!wantedGids.includes(gid)) {
							el.remove();
							groupRows.delete(gid);
						}
					}
					for (const g of state.groups) {
						if (!groupRows.has(g.id)) groupRows.set(g.id, makeRow("group", g.id));
					}
					if (pluginsRow === null) pluginsRow = makeRow("plugins");
					const wanted = [...state.groups.map((g) => groupRows.get(g.id))];
					if (state.count > 0) wanted.push(pluginsRow);
					else if (pluginsRow.parentNode !== null) pluginsRow.remove();
					// 每个注入行应恰好紧跟在上一个已放置节点之后（anchor 为 null 时位于列表开头）。
					// 注意：判断必须基于 anchor 的 nextSibling，而不是把行插到 anchor 之前，
					// 否则多行时会来回对调、触发观察器形成死循环。
					let anchor = coreEls.length > 0 ? coreEls[coreEls.length - 1] : null;
					for (const el of wanted) {
						const expected = anchor === null ? navList.firstChild : anchor.nextSibling;
						const placed = el.parentNode === navList && (expected === null ? el === navList.lastChild : el === expected);
						if (!placed) navList.insertBefore(el, expected);
						anchor = el;
					}
					// 4) 更新所有注入行文本
					for (const g of state.groups) updateRow(groupRows.get(g.id), "group", g.id);
					updateRow(pluginsRow, "plugins");
				} finally {
					inSync = false;
				}
			};

			// ---- 管理页的刷新通道（分组/条目变化或语言变化时通知页面重渲染）----
			const pageListeners = new Set();
			const notifyPage = () => {
				for (const fn of [...pageListeners]) fn();
			};

			// ---- 台账变化（插件增删设置页）→ 重算分组并同步 ----
			const refresh = () => {
				rows = ctx.slots.entries("settings.section")
					.map((e) => ({ id: e.options.id ?? "", order: e.options.order ?? 0, label: resolveLabel(e.options.label) }))
					.sort((a, b) => a.order - b.order);
				state.count = rows.filter((r) => !CORE.has(r.id) && groupOf(r.id) === undefined).length;
				applyRules();
				sync();
				notifyPage();
			};
			ctx.effect(() => ctx.slots.subscribe("settings.section", refresh), "settings-nav: section ledger watch");
			ctx.effect(() => ctx.locale.subscribe(() => {
				refresh();
			}), "settings-nav: locale watch");

			// ---- 「分组管理」设置页（书签管理器）----
			function GroupsPage(props) {
				const tPage = props.t ?? ((k) => k);
				const [, force] = React.useState(0);
				const [draft, setDraft] = React.useState("");
				const [renaming, setRenaming] = React.useState(null);
				const [renameDraft, setRenameDraft] = React.useState("");
				React.useEffect(() => {
					pageListeners.add(force);
					return () => {
						pageListeners.delete(force);
					};
				}, []);
				const list = rows.filter((r) => !CORE.has(r.id));
				const mutate = (fn) => {
					fn();
					saveGroups();
					applyRules();
					sync();
					notifyPage();
				};
				const createGroup = () => {
					const name = draft.trim();
					if (name === "") return;
					mutate(() => {
						state.groups.push({ id: String(nextGroupId++), name, entries: [] });
					});
					setDraft("");
				};
				const moveToGroup = (entryId, gid) => {
					if (gid === "") return;
					mutate(() => {
						for (const g of state.groups) g.entries = g.entries.filter((id) => id !== entryId);
						const target = state.groups.find((g) => g.id === gid);
						if (target !== undefined && !target.entries.includes(entryId)) target.entries.push(entryId);
					});
				};
				const removeFromGroup = (entryId, gid) => {
					mutate(() => {
						const g = state.groups.find((x) => x.id === gid);
						if (g !== undefined) g.entries = g.entries.filter((id) => id !== entryId);
					});
				};
				const deleteGroup = (gid) => {
					mutate(() => {
						state.groups = state.groups.filter((g) => g.id !== gid);
						delete state.open[gid];
					});
				};
				const startRename = (g) => {
					setRenaming(g.id);
					setRenameDraft(g.name);
				};
				const commitRename = (gid) => {
					const name = renameDraft.trim();
					if (name !== "") {
						mutate(() => {
							const g = state.groups.find((x) => x.id === gid);
							if (g !== undefined) g.name = name;
						});
					}
					setRenaming(null);
				};

				const membership = new Map();
				for (const g of state.groups) for (const id of g.entries) if (list.some((r) => r.id === id)) membership.set(id, g.id);
				const ungrouped = list.filter((r) => !membership.has(r.id));
				const inGroup = (id) => list.some((r) => r.id === id);

				return React.createElement("div", { className: "dsh-snav-page" },
					React.createElement("div", { className: "dsh-snav-new" },
						React.createElement("input", {
							className: "dsh-snav-input",
							placeholder: tPage("groupName"),
							value: draft,
							onChange: (e) => setDraft(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter") createGroup();
							},
						}),
						React.createElement("button", { className: "dsh-snav-btn", onClick: createGroup }, tPage("newGroup")),
					),
					state.groups.length === 0
						? React.createElement("p", { className: "dsh-snav-hint" }, tPage("noGroups"))
						: state.groups.map((g) => {
							const items = g.entries.filter(inGroup);
							return React.createElement("div", { key: g.id, className: "dsh-snav-gcard" },
								React.createElement("div", { className: "dsh-snav-ghead" },
									renaming === g.id
										? React.createElement(React.Fragment, null,
											React.createElement("input", {
												className: "dsh-snav-input",
												value: renameDraft,
												onChange: (e) => setRenameDraft(e.target.value),
												onKeyDown: (e) => {
													if (e.key === "Enter") commitRename(g.id);
													if (e.key === "Escape") setRenaming(null);
												},
											}),
											React.createElement("button", { className: "dsh-snav-btn", onClick: () => commitRename(g.id) }, tPage("rename")),
										)
										: React.createElement(React.Fragment, null,
											React.createElement("span", { className: "dsh-snav-gname" }, `${g.name} (${items.length})`),
											React.createElement("button", { className: "dsh-snav-btn dsh-snav-mini", onClick: () => startRename(g) }, tPage("rename")),
											React.createElement("button", { className: "dsh-snav-btn dsh-snav-mini dsh-snav-danger", onClick: () => deleteGroup(g.id) }, tPage("delete")),
										),
								),
								React.createElement("div", { className: "dsh-snav-gitems" },
									items.length === 0
										? React.createElement("span", { className: "dsh-snav-hint" }, tPage("empty"))
										: items.map((id) => {
											const row = list.find((r) => r.id === id);
											return React.createElement("div", { key: id, className: "dsh-snav-item" },
												React.createElement("span", { className: "dsh-snav-itemname" }, row.label || id),
												React.createElement("button", { className: "dsh-snav-btn dsh-snav-mini", onClick: () => removeFromGroup(id, g.id) }, tPage("remove")),
											);
										}),
								),
							);
						}),
					React.createElement("div", { className: "dsh-snav-ung" },
						React.createElement("div", { className: "dsh-snav-ghead" },
							React.createElement("span", { className: "dsh-snav-gname" }, `${tPage("ungrouped")} (${ungrouped.length})`),
						),
						ungrouped.length === 0
							? React.createElement("span", { className: "dsh-snav-hint" }, tPage("empty"))
							: ungrouped.map((r) =>
								React.createElement("div", { key: r.id, className: "dsh-snav-item" },
									React.createElement("span", { className: "dsh-snav-itemname" }, r.label || r.id),
									React.createElement("select", {
										className: "dsh-snav-select",
										value: "",
										onChange: (e) => {
											if (e.target.value !== "") moveToGroup(r.id, e.target.value);
										},
									},
										React.createElement("option", { value: "" }, tPage("addToGroup")),
										state.groups.map((g) => React.createElement("option", { key: g.id, value: g.id }, g.name)),
									),
								),
							),
					),
				);
			}

			ctx.slots.inject("settings.section", () => ctx.slots.register(
				{ name: "settings.section", id: "settings-nav-groups", order: 25, label: () => t("groups"), locale: NS },
				GroupsPage,
			));

			// 面板打开 / React 重渲染导航列表时重新注入行与标记。
			// 只响应两类变化：body 直接子级（设置面板挂载/卸载）与导航列表子树
			// （React 重渲染按钮）；其余区域的 DOM 变化一律忽略，避免误触发。
			// 附加风暴看门狗：异常时挂起观察 2 秒并告警，页面不会被永久卡死。
			let syncCount = 0;
			let stormBase = 0;
			let observerSuspended = false;
			let stormTimer = null;
			const observer = new MutationObserver((mutations) => {
				if (observerSuspended) return;
				let needSync = false;
				for (const m of mutations) {
					if (m.type !== "childList") continue;
					const target = m.target;
					if (!(target instanceof Element)) continue;
					if (target.closest?.(".dsh-snav-chip")) continue;
					if (target === document.body || target.closest?.(FOLD_SEL) !== null) {
						needSync = true;
						break;
					}
				}
				if (!needSync) return;
				const now = Date.now();
				if (now - stormBase > 1000) {
					syncCount = 0;
					stormBase = now;
				}
				syncCount += 1;
				if (syncCount > 20) {
					console.warn("[settings-nav-fold] mutation storm — suspending observer for 2s");
					observerSuspended = true;
					observer.disconnect();
					stormTimer = setTimeout(() => {
						stormTimer = null;
						observerSuspended = false;
						observer.observe(document.body, { childList: true, subtree: true });
						sync();
					}, 2000);
					return;
				}
				sync();
			});
			observer.observe(document.body, { childList: true, subtree: true });
			ctx.effect(() => () => {
				observer.disconnect();
				if (stormTimer !== null) clearTimeout(stormTimer);
				for (const [, el] of groupRows) el.remove();
				if (pluginsRow !== null) pluginsRow.remove();
			}, "settings-nav: dom observer cleanup");

			refresh();
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
