# dsh-settings-nav-fold

> [**English**](README.md) | **中文**

给 DeepSeek Harness 设置面板「减负」：插件装得越多，设置页侧边栏的入口就越乱。本插件把所有插件/扩展的设置入口折叠成一个可展开的 **插件入口** 分组行，就放在系统配置下方，带下拉箭头，点击即展开/收起。

![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)

## 功能

- **分组行放在系统配置正下方** —— 通用设置 / 模型 / 插件 / 预设保持平铺；其余入口（插件、扩展、附加页面）全部折叠进「插件入口 (N) ▾」。
- **书签式自定义分组** —— 像书签文件夹一样创建命名分组，把任意设置入口归入分组，导航中每个分组独立展开/收起；设置面板新增「分组管理」页，可新建、重命名、删除分组，条目移入/移出分组。
- **一键展开/收起** —— 点击分组行，组内条目在其下方展开；再点即收起。未分组的条目保留在「插件入口 (N) ▾」行。
- **持久化** —— 分组配置存于 localStorage（键 `dsh.settingsNavFold.v1`），重启不丢。
- **可视化插件管理** —— 设置面板新增「插件管理」页：对用户补丁层（profile patch）安装的插件可一键禁用、启动或卸载，运行时立即生效并持久化到 `cordis.patch.yml` 与 profile `package.json`；来自 bundle 的插件为只读。
- **自动更新** —— 计数与折叠位置实时跟随 `settings.section` 台账重算，插件注册/卸载设置页时自动增减，无需任何配置。
- **当前页不消失** —— 正在查看的插件设置页即使处于折叠状态也保持可见。
- **跟随界面语言** —— 中文 / English。
- **纯浏览器端插件** —— 无宿主端代码，host 进程零负担。

## 安装

```sh
dsh plugin --profile web add github:zhengjy01/dsh-settings-nav-fold
```

重启 `dsh` 后打开设置面板（侧边栏底部齿轮），导航即变为「系统配置各项 + 插件入口 (N) ▾」分组行。

## 原理

设置导航列表由面板内部渲染、并非 Slot，因此插件：

1. 读取 `settings.section` 台账（`ctx.slots.entries`），按与面板完全一致的排序算法计算行序；
2. 把分组行**注入**到导航列表 DOM 中最后一个系统配置项之后（幂等：位置正确时不改动 DOM）；
3. 用 `data-snav-plugin` 标记插件按钮、`data-snav-folded` 标记列表，通过一小段样式表折叠（当前激活的 `aria-current` 行保持可见）；
4. 用 `MutationObserver` 跟随台账变化与面板重渲染，插件增删时分组始终正确。

样式、订阅、观察器与注入行全部挂在插件 fiber 上，停止或卸载插件时自动清理、完全还原。

## 卸载

```sh
dsh plugin --profile web remove dsh-settings-nav-fold
```

## License

[MIT](LICENSE)
