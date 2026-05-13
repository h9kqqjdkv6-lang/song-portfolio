/**
 * 为山林搜救、公安执法、医疗应急写入与高楼灭火同构的 briefingDepthTemplates。
 * 运行：node scripts/patch-briefing-sar-police-med.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const scenesPath = path.join(root, "scenes.json");

const FULL_HINT =
  "全案汇编：仅输出装订正文（封面四项、前言、声明框、一至七章、附录一至四）；不叠放政策解读、参数条、流程与客户话术块。";

const SAR = {
  overview: {
    title: "决策速览",
    decisionBrief: {
      coreConflict:
        "山林失联警情窗口紧、地形割裂、夜航与弱网并存；仅靠地面单向推进易错失目标，热背景与林冠遮挡放大误判。",
      solutionSummary:
        "以「两遍法」空中格网为主线：一遍广角+红外扫出可疑热源，一遍变焦辨人；喊话稳局、激光打点进指挥云，与地面队同一坐标系接引，弱网以最后已知点保底。",
      capabilities: [
        "先搜后辨：云台下俯配合斜向航线，压低正下方盲区；红外在夜航与冷背景条件下快速筛点。",
        "空地一体：司空2/客户统一任务号、动态跟踪点与录像边缘缓存，恢复链路后补传关键帧。",
        "稳局接引：喊话器稳局、底灯指示方位；熔断风切变、低电量与链路中断预案写死到 SOP。",
      ],
      orgTable: [
        { platform: "中型搜救主平台（RTK+双光）", duty: "格网扫测、变焦确认、打点回传", qty: "≥1架" },
        { platform: "轻便侦察/接力机", duty: "外缘走廊扫测或电池接力", qty: "按需" },
        { platform: "地面搜救分队", duty: "按坐标接引、医救前出", qty: "≥1组" },
        { platform: "指挥专链节点", duty: "弱网聚合、任务 ID 与离线包", qty: "≥1套" },
        { platform: "快充/换电单元", duty: "轮转缩短再次出动间隔", qty: "按驻点配置" },
      ],
      complianceOneLiner:
        "依法完成登记、运营资质与操控员资质；任务备案与飞行计划齐备；夜航与管制空域按属地另批；影像限搜救用途并约定留存周期。",
      authorityNextSteps: [
        "冻结失联区格网编号、坐标系（GCJ-02/WGS-84）与指挥云接口牵头单位。",
        "将「广角—变焦—打点—弱网」纳入季度联勤桌演+带飞。",
      ],
    },
    footerNote: "",
  },
  technical: {
    title: "技术深化｜山林热成像搜救技术解析",
    preamble:
      "本节按问题—逻辑—实现—要点叙述山林热成像搜救；定量以战训实测与厂方最新规格为准。",
    dataDisclaimerGlobal: "航时、测温与风限等须在标称工况上叠加海拔、低温与负载功耗折扣。",
    phases: [
      {
        sectionNo: "第一节",
        title: "侦察与热源管理",
        problem: "林冠与峡谷地形造成下视盲区，冷背景、水面与岩石易产生假热点。",
        logic: "先广角后变焦；云台下俯与斜向航线结合，压制正下方未知区。",
        implementation:
          "H30T 等双光载荷快扫标记异常温升，可疑点变焦复核人体轮廓与行为，全过程写入任务号。",
        operationPoints: "坚持两遍法；早变焦易漏扫；热源清单与格网块编号对齐。",
        simplifiedTable: {
          caption: "表1-1 扫测手法对照",
          headers: ["阶段", "手段", "输出"],
          rows: [
            ["第一遍", "广角+红外", "可疑点清单"],
            ["第二遍", "变焦+测距", "人体确认与坐标"],
            ["接引", "喊话+底灯", "稳局与方位指示"],
          ],
        },
        fieldTips: ["山口风切变显著时缩短滞空，随时准备备降。", "链路抖动时本地缓存最后一帧坐标。"],
        quantityLine: "公开工况航时须按海拔与风速打折；测温门限由战训标定。",
      },
      {
        sectionNo: "第二节",
        title: "空地协同与坐标统一",
        problem: "空地若坐标系不一致，打点无法被地面队复现。",
        logic: "激光测距+RTK 将目标写入指挥云，与地面 APP/电台同一基准。",
        implementation:
          "司空2或客户云汇聚视频、航迹与打点；地面队动态跟踪点随目标移动刷新。",
        operationPoints: "接手人员双签确认疑似目标再前出，避免单人误判。",
        simplifiedTable: {
          caption: "表2-1 协同分工",
          headers: ["要素", "空中", "地面"],
          rows: [
            ["发现", "热源标注", "望远镜/便携红外复核"],
            ["接引", "悬停监看", "医救前出"],
            ["记录", "时间戳录像", "任务手记+坐标截图"],
          ],
        },
        fieldTips: ["移动目标持续刷新跟踪点直至汇合。", "交接完毕后归档航迹供复盘。"],
        quantityLine: "坐标漂移以 RTK 固定解状态与客户验收抽测为准。",
      },
      {
        sectionNo: "第三节",
        title: "弱网、夜航与熔断",
        problem: "山区链路断续，夜航审批与灯光管理要求高。",
        logic: "边缘缓存+最后已知点；夜航单独报批，灯光模式避免眩光干扰。",
        implementation:
          "图传中断时记录最后航向与高度层；恢复后批量补传；风速超平台阈值立即返航。",
        operationPoints: "雷雨、大风与低电量任一则执行预案终止线。",
        simplifiedTable: {
          caption: "表3-1 熔断条件示例",
          headers: ["触发", "动作"],
          rows: [
            ["风速>额定抗风", "返航或备降"],
            ["链路中断>阈值", "记入 LKP，地面复核"],
            ["电量低于预留", "中止扩展扫测，直接回程"],
          ],
        },
        fieldTips: ["夜航包需额外批复印件随队。", "禁火窗口与空域通告每日复核。"],
        quantityLine: "具体阈值写入客户 SOP；本稿不代填未经会签的数字。",
      },
    ],
    closingNote: "本解析不构成空域许可；与警务/空管接口须单独立项。",
    glossary: [
      { term: "两遍法", definition: "先快速广域扫测再找点变焦确认，降低漏扫与误判。" },
      { term: "最后已知点（LKP）", definition: "链路中断前最后一次可信坐标与航向，用于指引地面搜寻。" },
      { term: "动态跟踪点", definition: "目标移动时持续更新的指挥云坐标，直至空地汇合。" },
      { term: "格网", definition: "失联区按山路/等高线切块编号，便于分工与复盘。" },
    ],
  },
  full: {
    deliverableTitle: "",
    cover: {
      organization: "〔待补充单位名称〕",
      applicableScene: "复杂地形条件下失踪人员空中搜救与空地协同处置",
      version: "V1.0",
      dateText: "2026年5月",
      scenarioName: "",
    },
    documentControl: { rows: [] },
    tableOfContents: [],
    executiveSummary: "",
    prefaceTitle: "前言与编制说明",
    prefaceParagraphs: [
      "山林走失与灾害救援中，空中视角能显著压缩搜索空白区，但必须与空地协同、弱网保障结合方可落地。",
      "本方案给出与现有条例、国标相衔接的叙述框架，正文一至七章与附录可据客户战训与采购书替换量化表。",
    ],
    disclaimerBox:
      "本文为演示级装订框架，航时、风限、测温门限与审批流程须以属地空管、应急部门及厂方最终会签为准。",
    bodyChapters: [
      {
        chapterNo: "一、",
        title: "场景定义与痛点分析",
        intro: "复杂山林搜救具有窗口紧、地形遮挡、夜航弱网并存等特征。",
        sections: [
          {
            heading: "（一）主要矛盾",
            body: "地面队单维度推进难以覆盖深谷与陡崖；可见光在夜航与雨雾下失效；热成像易受环境假热点干扰。",
          },
          {
            heading: "（二）任务特征",
            paragraphs: [
              "失联区常与主路、兽径相关，格网划设应对齐可通达走廊。",
              "接警后需在安全前提下尽快建立空中视角，避免盲目扩大徒步范围。",
            ],
          },
        ],
      },
      {
        chapterNo: "二、",
        title: "核心价值主张",
        intro: "以可复制的两遍法与统一坐标，将「找得到、接得住、留得下证据」串成闭环。",
        sections: [
          {
            heading: "",
            paragraphs: [
              "快扫：广角+红外压低盲区，形成可疑点清单。",
              "精辨：变焦+测距确认目标，激光打点写入指挥云。",
              "稳局：喊话与照明支持地面接引，弱网以 LKP 保底。",
            ],
          },
        ],
      },
      {
        chapterNo: "三、",
        title: "任务规划与作业流程",
        intro: "流程与场景 `operationFlow` SOP-0～8 一致，此处给出指挥视角摘要。",
        sections: [
          {
            heading: "（一）放行与起飞准备",
            body: "执照、备案与计划齐备；夜航与管制空域单独报批；RTK、电池与避障自检。",
          },
          {
            heading: "（二）格网扫测与确认",
            body: "沿主路/兽径布设走廊或格网；第一遍快扫，第二遍对可疑点变焦；全程任务号一致。",
          },
          {
            heading: "（三）弱网与撤收",
            body: "记录 LKP 与最后航向；风速、电量或指挥口令触发熔断返航；航迹与录像归档。",
          },
        ],
      },
      {
        chapterNo: "四、",
        title: "装备选型与地面保障",
        intro: "主平台选型应与负载链、商载与兼容性矩阵一致。",
        sections: [
          {
            heading: "（一）平台与负载",
            body: "中型 RTK 平台挂载双光云台；喊话、测距、底灯纳入统一重量预算；接力机用于外缘扫测或航时补充。",
          },
          {
            heading: "（二）链路与地面保障",
            paragraphs: [
              "指挥专链节点支持弱网聚合与离线包；地面队终端与指挥云坐标系书面锁定。",
              "快充/换电轮转缩短再次出动；备降点与补给点在格网图中标注。",
            ],
          },
        ],
      },
      {
        chapterNo: "五、",
        title: "推荐编成与部署方案",
        intro: "最小编成示例，可按行政区或林场分局扩展。",
        sections: [
          {
            heading: "最小单元建议",
            paragraphs: [
              "搜救主平台 1；指挥专链 1；地面分队 1；换电/快充单元按驻点配置。",
              "可选轻便侦察机用于外缘初扫，降低主平台无效航时。",
            ],
          },
        ],
      },
      {
        chapterNo: "六、",
        title: "安全与合规底线",
        intro: "",
        sections: [
          {
            heading: "（一）飞行与环境安全",
            paragraphs: [
              "关注峡谷风切与树冠障碍；严禁低于安全高度贴林飞行。",
              "浓烟、雷雨或能见度不满足时禁止强行作业。",
            ],
          },
          {
            heading: "（二）数据与法规",
            paragraphs: [
              "遵守无人驾驶航空器条例关于登记、资质、保险与空域管理的条款。",
              "热成像与影像留存限搜救与复盘用途，周期与脱敏策略书面约定。",
            ],
          },
        ],
      },
      {
        chapterNo: "七、",
        title: "附录",
        intro: "支撑材料见附录一至四；技术表格可在采购阶段替换为厂方与战训会签版。",
        sections: [],
      },
    ],
    appendices: [
      {
        appendixNo: "附录一",
        title: "SOP 阶段与时间轴占位",
        paragraphs: ["（插入格网划分表、阶段口令与典型时间轴，由客户战训填写。）"],
      },
      {
        appendixNo: "附录二",
        title: "负载与通信参数占位",
        paragraphs: ["（插入兼容矩阵、带宽与弱网策略抽测记录。）"],
      },
      {
        appendixNo: "附录三",
        title: "法规与标准合规快表",
        paragraphs: [],
        lawTable: {
          caption: "表附3-1 法规快表（示例）",
          headers: ["要点", "说明"],
          rows: [
            ["实名登记与资质", "条例第十条、第十一条、第十六条等"],
            ["飞行计划与夜航", "属地公安机关及空中交通管理机构要求"],
            ["个人信息与影像", "依法限定用途与留存周期"],
          ],
        },
      },
      {
        appendixNo: "附录四",
        title: "边界声明与联络渠道",
        paragraphs: [
          "边界声明：公开航时/风限为厂方标称叙事锚点，投标以最终会签为准。",
          "联络渠道与增值服务用语由编制单位补充。",
        ],
      },
    ],
    figureTableCounterStart: 1,
  },
};

const POLICE = {
  overview: {
    title: "决策速览",
    decisionBrief: {
      coreConflict:
        "大型警情与群体性事件现场取证窗口短、风险高；地面视角难以快速覆盖广域要素，电子证据若链路或程序不合规则无法闭环。",
      solutionSummary:
        "无人机快速抵近、双光取证与平台打点同步；全程加密链路至警务视频云，按程序规定封装哈希与时间轴的证据包，指挥席与一线民警同源可视。",
      capabilities: [
        "广域抵近：安全高度覆盖现场态势，变焦锁定关键要素。",
        "链路与合规：专网/加密与 GB/T28181 或客户网关对接，防止违规外泄。",
        "证据闭环：时间、坐标、视音频哈希与笔录清单一体导出。",
      ],
      orgTable: [
        { platform: "执法取证主平台", duty: "双光云台、打点回传", qty: "≥1架" },
        { platform: "通信与加密节点", duty: "聚合路由、断网本地加密缓存", qty: "≥1套" },
        { platform: "指挥中心席", duty: "任务分发、法务审计账号", qty: "按编制" },
        { platform: "法制/督查联席", duty: "证据格式与留存签认", qty: "按需进驻" },
      ],
      complianceOneLiner:
        "飞行与人员资质符合无人驾驶航空器条例；电子数据收集、固定与移送符合《公安机关办理行政案件程序规定》等现行有效文本；涉密与个人信息采集遵守授权边界。",
      authorityNextSteps: [
        "确认视频平台接口版本与等保分区、证据导出目录结构。",
        "联合法制支队做一次端到端取证实飞演练并形成签字纪要。",
      ],
    },
    footerNote: "",
  },
  technical: {
    title: "技术深化｜警务低空取证与视频联网",
    preamble: "从抵近、传输到固证分节说明；量化与时戳误差以平台测评与客户验收为准。",
    dataDisclaimerGlobal: "哈希与时间戳用于防篡改校验，证明力仍受法定程序与法庭审查约束。",
    phases: [
      {
        sectionNo: "第一节",
        title: "快速抵近与光学取证",
        problem: "地面摄录角度受限，易遗漏动态要素。",
        logic: "中空斜向覆盖+变焦局部固证，兼顾安全距离。",
        implementation: "按预案航线高度、速度进入任务空域；热成像辅助夜间与烟雾条件下的要素辨识。",
        operationPoints: "变焦取证遵守当地对敏感采集的规定；避免非任务需要的长时间跟拍。",
        simplifiedTable: {
          caption: "表1-1 取证动作",
          headers: ["阶段", "输出"],
          rows: [
            ["广域覆盖", "态势图传"],
            ["变焦固证", "关键帧与时间码"],
            ["打点", "平台坐标+任务号"],
          ],
        },
        fieldTips: ["人员密集区优先固定高度层，减少公众心理扰动。", "恶劣天气按指挥口令熔断。"],
        quantityLine: "图传丢包率与时钟偏差以警务云监控指标为准。",
      },
      {
        sectionNo: "第二节",
        title: "加密链路与平台对接",
        problem: "公网直传不满足等保与客户视频联网规范。",
        logic: "专网/ VPN 与 GB/T28181 信令媒体版本书面锁定；断网本地加密落盘。",
        implementation: "视频流经警务加密通道；与社会面平台对接走指定网关；恢复链路后按审计策略补传。",
        operationPoints: "账号分级：指挥、取证、审计三权分立；导出操作全量审计。",
        simplifiedTable: {
          caption: "表2-1 对接要素",
          headers: ["层", "要求"],
          rows: [
            ["传输", "TLS/专网策略"],
            ["信令", "28181 版本与客户增补"],
            ["本地", "断电保护与加密存储"],
          ],
        },
        fieldTips: ["白名单与防火墙策略提前工单化，避免临演端口不通。"],
        quantityLine: "具体端口与加密套件以信息化部门会签为准。",
      },
      {
        sectionNo: "第三节",
        title: "证据包与程序衔接",
        problem: "仅有视频文件不足以形成可移送材料。",
        logic: "封装文件夹结构+哈希清单+可信时间戳（如客户策略要求）+笔录相互印证。",
        implementation: "平台一键导出符合法制支队模板；必要时打印或拍照固定附说明。",
        operationPoints: "对涉及个人隐私的画面脱敏策略预先备案。",
        simplifiedTable: {
          caption: "表3-1 证据包要素",
          headers: ["项", "说明"],
          rows: [
            ["时间线", "UTC/NTP 对齐"],
            ["哈希", "SHA-256/SM3 等"],
            ["签认", "制作人、法制复核"],
          ],
        },
        fieldTips: ["重大案件建议同步磁带库或冷备策略。"],
        quantityLine: "程序条款以最新修订的程序规定及本地细则为准。",
      },
    ],
    closingNote: "本解析不构成法律意见；敏感案件口径以法制部门为准。",
    glossary: [
      { term: "GB/T 28181", definition: "公共安全视频监控联网常用国标，对接版本须与客户省级平台一致。" },
      { term: "证据包", definition: "含视音频、元数据、哈希清单与签认信息的结构化导出物。" },
      { term: "专网链路", definition: "与互联网逻辑隔离的警务承载网络及加密隧道。" },
    ],
  },
  full: {
    deliverableTitle: "",
    cover: {
      organization: "〔待补充单位名称〕",
      applicableScene: "警务警情低空快速取证与视频证据链闭环",
      version: "V1.0",
      dateText: "2026年5月",
      scenarioName: "",
    },
    documentControl: { rows: [] },
    tableOfContents: [],
    executiveSummary: "",
    prefaceTitle: "前言与编制说明",
    prefaceParagraphs: [
      "科技兴警背景下，低空平台为指挥席提供广域、快速、可追溯的视听材料，但必须与法定取证程序和信息化规范对齐。",
      "本方案提供装订式叙事骨架，接口与等保参数应由客户科技与法制部门联合定稿。",
    ],
    disclaimerBox:
      "文中所列程序与标准名称供培训讨论；引用条文以国家法律法规数据库及客户提供的可公开文本为准。",
    bodyChapters: [
      {
        chapterNo: "一、",
        title: "场景定义与痛点分析",
        intro: "大型现场态势变化快、风险高，传统取证手段覆盖与固证效率不足。",
        sections: [
          {
            heading: "（一）指挥与取证矛盾",
            body: "地面机位难以快速建立全场面；移动端上传若不走专网存在合规风险。",
          },
          {
            heading: "（二）任务边界",
            paragraphs: [
              "聚焦依法授权的空中巡视与取证，敏感采集须事前授权与事中审计。",
              "与交通、应急等跨部门接口在联合预案中定义数据归属。",
            ],
          },
        ],
      },
      {
        chapterNo: "二、",
        title: "核心价值主张",
        intro: "以「可视、可达、可证」为主线服务法制化处置。",
        sections: [
          {
            heading: "",
            paragraphs: [
              "可视：双光图传与平台同屏指挥。",
              "可达：预设安全航线覆盖热点区域。",
              "可证：时间、坐标、哈希与清单一体导出。",
            ],
          },
        ],
      },
      {
        chapterNo: "三、",
        title: "任务规划与作业流程",
        intro: "与场景 operationFlow 时序对齐的指挥摘要。",
        sections: [
          {
            heading: "（一）接警与起飞",
            body: "空域与任务备案完成后起飞，加密链路握手成功方可进入取证航线。",
          },
          {
            heading: "（二）取证与打点",
            body: "变焦固证与平台打点同步；多要素任务拆分任务号管理。",
          },
          {
            heading: "（三）固证与上传",
            body: "落地后按法制模板导出证据包；专网中断场景先本地加密再补传。",
          },
        ],
      },
      {
        chapterNo: "四、",
        title: "装备选型与地面保障",
        intro: "",
        sections: [
          {
            heading: "（一）平台与挂载",
            body: "中型多旋翼+双光云台为主；总重与抗风须留安全裕度。",
          },
          {
            heading: "（二）网络与地面设备",
            paragraphs: [
              "聚合路由器、专网终端与移动电源构成机动节点。",
              "重大活动前完成链路压测与账号演练。",
            ],
          },
        ],
      },
      {
        chapterNo: "五、",
        title: "推荐编成与部署方案",
        intro: "",
        sections: [
          {
            heading: "最小单元",
            paragraphs: ["取证机 1；通信节点 1；指挥席 1；法制联络机制常态化。"],
          },
        ],
      },
      {
        chapterNo: "六、",
        title: "安全与合规底线",
        intro: "",
        sections: [
          {
            heading: "（一）飞行安全",
            paragraphs: ["雷雨大风熔断；人群密集区控制噪声与高度；夜间飞行按批件执行。"],
          },
          {
            heading: "（二）数据与保密",
            paragraphs: [
              "涉密视频禁止违规互联网传播；个人信息脱敏与访问控制按公安数据安全规定执行。",
            ],
          },
        ],
      },
      {
        chapterNo: "七、",
        title: "附录",
        intro: "表格与接口说明书在采购阶段替换为客户定稿版。",
        sections: [],
      },
    ],
    appendices: [
      {
        appendixNo: "附录一",
        title: "典型时序与口令表占位",
        paragraphs: ["（插入 T+0/T+3/T+8/T+10min 与客户指挥口令变体。）"],
      },
      {
        appendixNo: "附录二",
        title: "平台与网络参数占位",
        paragraphs: ["（插入 28181 版本、端口、加密套件与压测截图索引。）"],
      },
      {
        appendixNo: "附录三",
        title: "法规与标准快表",
        paragraphs: [],
        lawTable: {
          caption: "表附3-1 法规快表（示例）",
          headers: ["文件", "要点"],
          rows: [
            ["程序规定（证据章节）", "视听资料、电子数据收集与固定"],
            ["无人驾驶航空器条例", "登记、执照、空域"],
            ["数据安全/个保法律", "授权、脱敏、留存"],
          ],
        },
      },
      {
        appendixNo: "附录四",
        title: "边界声明与联络渠道",
        paragraphs: [
          "边界声明：公开指标为叙事参考，投标响应以客户招标文件与测评报告为准。",
          "联络渠道由编制单位补充。",
        ],
      },
    ],
    figureTableCounterStart: 1,
  },
};

const MED = {
  overview: {
    title: "决策速览",
    decisionBrief: {
      coreConflict:
        "血液与急救物资对温控与时窗极度敏感；城市道路拥堵与院内接驳不确定性放大断链风险。",
      solutionSummary:
        "医疗构型无人机货舱预冷后装载，航线直达协定起降点；电子交接与追溯号贯通血站—飞行—院内，温控曲线可导出备查。",
      capabilities: [
        "温控优先：起飞前预冷，飞行中连续监测，落地即交接。",
        "时窗可视：指挥席掌握 ETA 与异常门限，触发备降与接力。",
        "追溯一体：对接 HIS/物流平台策略由客户信息化部门会签。",
      ],
      orgTable: [
        { platform: "医疗运力平台", duty: "温控货舱航线直飞", qty: "按协议" },
        { platform: "血站/药房发站", duty: "装箱签证与追溯号", qty: "1" },
        { platform: "院内接收组", duty: "净空、卸货与签名回执", qty: "1" },
        { platform: "运管与医务值班", duty: "熔断与不良事件上报", qty: "按院规" },
      ],
      complianceOneLiner:
        "飞行活动遵守无人驾驶航空器条例；运输层遵循临床用血与 WS 400 等卫生标准技术指标；个人信息与医疗数据按卫健客户规范处理。",
      authorityNextSteps: [
        "固化血站—医院航线批件与院内起降点协议文本。",
        "完成一次冷链验证飞行（IQ/OQ/PQ 或等效）并形成联合签字。",
      ],
      timeWindowNarrative:
        "以「黄金窗口」叙事服务临床：具体缩短比例须引用血站与医院出具的 Before/After 数据，本稿不代填未经核验的百分比。",
    },
    footerNote: "",
  },
  technical: {
    title: "技术深化｜医疗低温物资低空运输",
    preamble: "温控、航线与时窗、院内交接三节展开；定量以冷链验证与厂方规格为准。",
    dataDisclaimerGlobal: "红细胞 2–6℃ 等阈值以现行规章与标准 PDF 为准；无人机厢内设定值由多学科评审锁定。",
    phases: [
      {
        sectionNo: "第一节",
        title: "温控与装载",
        problem: "地面与环境热扰动易导致超温或欠温。",
        logic: "预冷—装载签证—飞行中监测—落地立即交接的四段控制。",
        implementation:
          "货舱传感器采样周期与告警门限写入 SOP；异常即中断起飞或启动备降。",
        operationPoints: "装机单与追溯号双人复核；电池模式下注意航时与温控功耗折减。",
        simplifiedTable: {
          caption: "表1-1 温控链路",
          headers: ["环节", "控制点"],
          rows: [
            ["预冷", "达到设定起始温区"],
            ["装机", "签证与时间戳"],
            ["在航", "连续曲线记录"],
            ["交割", "电子签名"],
          ],
        },
        fieldTips: ["酷暑/严寒天气需额外环境修正策略。"],
        quantityLine: "验证报告应附于服务标响应。",
      },
      {
        sectionNo: "第二节",
        title: "航线、空域与时窗",
        problem: "城区空域与院内净空限制多，时窗不可违约。",
        logic: "批件航线+备降点+接力方案； ETA 与窗口双约束调度。",
        implementation:
          "批件与 NOTAM/公告每日复核；指挥席掌握改降决策链。",
        operationPoints: "「提升50%」类表述禁止出现在未引用数据的文本中。",
        simplifiedTable: {
          caption: "表2-1 调度要素",
          headers: ["要素", "说明"],
          rows: [
            ["主航线", "批件坐标廊道"],
            ["备降", "第二医院或地面冷链车"],
            ["时窗", "手术室/检验科接收时段"],
          ],
        },
        fieldTips: ["院内迫降预案与保卫、院感联合签字。"],
        quantityLine: "准点率 KPI 以客户统计为准。",
      },
      {
        sectionNo: "第三节",
        title: "院内交接与信息化",
        problem: "不与 HIS/物流平台对齐则追溯断裂。",
        logic: "HL7/FHIR 或医院集成平台中转，避免直连核心库。",
        implementation: "电子交接单、温控曲线与航迹绑定存储；权限按最小化原则。",
        operationPoints: "不良事件按院感与药事路径上报。",
        simplifiedTable: {
          caption: "表3-1 信息化要点",
          headers: ["项", "说明"],
          rows: [
            ["接口", "经集成平台"],
            ["日志", "符合留存周期"],
            ["灾备", "双活或冷备策略"],
          ],
        },
        fieldTips: ["演示地图航线与生产运行航线分离管理。"],
        quantityLine: "",
      },
    ],
    closingNote: "不构成医疗广告或疗效承诺；法规引用以正本为准。",
    glossary: [
      { term: "WS 400—2023", definition: "血液运输卫生行业标准，技术指标以 PDF 正文为准。" },
      { term: "IQ/OQ/PQ", definition: "安装/运行/性能确认，可作为冷链设备验证思路。" },
      { term: "追溯号", definition: "贯通发血—运输—交接的业务主键。" },
    ],
  },
  full: {
    deliverableTitle: "",
    cover: {
      organization: "〔待补充单位名称〕",
      applicableScene: "血液及急救物资低空温控快运与院内电子化交接",
      version: "V1.0",
      dateText: "2026年5月",
      scenarioName: "",
    },
    documentControl: { rows: [] },
    tableOfContents: [],
    executiveSummary: "",
    prefaceTitle: "前言与编制说明",
    prefaceParagraphs: [
      "院前与院内衔接段是血液与急救物资供应链的脆弱环节，低空直达可在合规前提下提供增量选项。",
      "本装订框架与卫健、空管、信息化多部门会签并行使用；温控与数据条款以采购文件为准。",
    ],
    disclaimerBox:
      "未列入批件的空域不得实施运行；本文定量占位须替换为验证报告与厂商会签参数。",
    bodyChapters: [
      {
        chapterNo: "一、",
        title: "场景定义与痛点分析",
        intro: "城市路况与院内不确定性影响温控与时窗双目标。",
        sections: [
          {
            heading: "（一）供应链痛点",
            body: "拥堵、路口延误与院内电梯/通道占用导致不可控等待；温度曲线一旦出现尖峰即可能触发报废风险。",
          },
          {
            heading: "（二）适用边界",
            paragraphs: [
              "适用于已获批航线与起降点、且信息化条件满足交接与审计的客户。",
              "不替代国家强制性标准中的陆运要求；为并联补充渠道。",
            ],
          },
        ],
      },
      {
        chapterNo: "二、",
        title: "核心价值主张",
        intro: "把「看得见温度、卡得住时窗、溯得到责任」落到运营级。",
        sections: [
          {
            heading: "",
            paragraphs: [
              "温控：预冷、在航监测、落地即交接。",
              "时窗：ETA+窗口双约束，异常即备降或接力。",
              "追溯：电子签名+曲线归档+权限可控。",
            ],
          },
        ],
      },
      {
        chapterNo: "三、",
        title: "任务规划与作业流程",
        intro: "与场景 operationFlow 四段时序一致。",
        sections: [
          {
            heading: "（一）需求确认与预冷",
            body: "核对成分、数量与温控区间；货舱预冷达标后签证装载。",
          },
          {
            heading: "（二）飞行与监控",
            body: "按批件航线实施；指挥席实时监控曲线与地理围栏。",
          },
          {
            heading: "（三）交割与返航",
            body: "院内接收电子签；返航后归档曲线供药事/血库抽查。",
          },
        ],
      },
      {
        chapterNo: "四、",
        title: "装备选型与地面保障",
        intro: "",
        sections: [
          {
            heading: "（一）运力与温控舱",
            body: "选型须满足商载与温控精度的联合指标；双电航时与备用接力方案写入保障章。",
          },
          {
            heading: "（二）地面与信息化",
            paragraphs: [
              "起降点安防、消防与院感要求一次会签；",
              "集成平台账号、VPN 与审计策略与信息科联调记录存档。",
            ],
          },
        ],
      },
      {
        chapterNo: "五、",
        title: "推荐编成与部署方案",
        intro: "",
        sections: [
          {
            heading: "最小单元",
            paragraphs: ["航线机组+签派；血站与院内各设联络员；重大节假日升格值班。"],
          },
        ],
      },
      {
        chapterNo: "六、",
        title: "安全与合规底线",
        intro: "",
        sections: [
          {
            heading: "（一）飞行与运行安全",
            paragraphs: ["气象熔断；院内净空与迫降水域预案；噪声与社会影响评估按属地要求。"],
          },
          {
            heading: "（二）医疗数据与患者隐私",
            paragraphs: [
              "遵循《个人信息保护法》及卫健数据分级要求；不存在单一所谓「医疗数据安全管理条例」可替代上述体系。",
            ],
          },
        ],
      },
      {
        chapterNo: "七、",
        title: "附录",
        intro: "验证记录、保险与商务条款在采购包中展开。",
        sections: [],
      },
    ],
    appendices: [
      {
        appendixNo: "附录一",
        title: "温控曲线与时序表占位",
        paragraphs: ["（插入典型航次曲线、门限与告警处置记录。）"],
      },
      {
        appendixNo: "附录二",
        title: "航线与起降点清单占位",
        paragraphs: ["（插入批件坐标、备降点与净空测量摘要。）"],
      },
      {
        appendixNo: "附录三",
        title: "法规与标准快表",
        paragraphs: [],
        lawTable: {
          caption: "表附3-1 法规快表（示例）",
          headers: ["文件", "要点"],
          rows: [
            ["临床用血管理办法等", "储存温度、运送要求"],
            ["WS 400—2023", "运输温度与监测"],
            ["无人驾驶航空器条例", "登记、保险、执照、空域"],
          ],
        },
      },
      {
        appendixNo: "附录四",
        title: "边界声明与联络渠道",
        paragraphs: [
          "边界声明：血液安全零容忍条款与保险背书在招标文件中逐条响应。",
          "联络渠道由编制单位补充。",
        ],
      },
    ],
    figureTableCounterStart: 1,
  },
};

const scenes = JSON.parse(fs.readFileSync(scenesPath, "utf8"));
scenes["山林搜救"].briefingDepthTemplates = SAR;
scenes["公安执法"].briefingDepthTemplates = POLICE;
scenes["医疗应急"].briefingDepthTemplates = MED;

for (const key of ["山林搜救", "公安执法", "医疗应急"]) {
  scenes[key].documentDepthHints = scenes[key].documentDepthHints || {};
  scenes[key].documentDepthHints.overview =
    scenes[key].documentDepthHints.overview ||
    "一页纸：场景矛盾→我方方案→核心能力→最小作战编成→合规→贵单位下一步+战训法规声明；参数与型号可深化档展开。";
  scenes[key].documentDepthHints.technical =
    scenes[key].documentDepthHints.technical ||
    "技术解析体例：问题—逻辑—实现—要点；分节叙述+简表+术语表；定量以战训或厂方为准。";
  scenes[key].documentDepthHints.full = FULL_HINT;
}

fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2) + "\n");
console.log("Patched scenes.json: 山林搜救 / 公安执法 / 医疗应急 briefingDepthTemplates + documentDepthHints.full");
