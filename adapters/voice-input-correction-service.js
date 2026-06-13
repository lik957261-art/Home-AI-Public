"use strict";

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeScope(scope = {}) {
  const source = isPlainObject(scope) ? scope : {};
  return {
    actorId: cleanString(source.actorId || source.actor_id || "anonymous", 120) || "anonymous",
    workspaceId: cleanString(source.workspaceId || source.workspace_id || "owner", 120) || "owner",
    surfaceType: cleanString(source.surfaceType || source.surface_type || "chat", 80) || "chat",
    pluginId: cleanString(source.pluginId || source.plugin_id || "", 120),
    threadId: cleanString(source.threadId || source.thread_id || "", 160),
    language: cleanString(source.language || source.locale || "", 40),
  };
}

function normalizeText(value, maxLength = 240000) {
  return String(value == null ? "" : value).replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

const DEFAULT_SYSTEM_PHRASES = Object.freeze([
  { term: "Home AI", aliases: ["home ai", "HomeAI"] },
  { term: "Codex", aliases: ["codex"] },
  { term: "Codex Mobile", aliases: ["codex mobile"] },
  { term: "ChatGPT Pro", aliases: ["chatgpt pro", "Chat GPT Pro"] },
  { term: "MCP", aliases: ["mcp"] },
  { term: "Gateway", aliases: ["gateway"] },
  { term: "handoff", aliases: ["hand off", "Hand off"] },
  { term: "Growth", aliases: ["growth"] },
  { term: "Email", aliases: ["email"] },
  { term: "Note", aliases: ["note"] },
  { term: "Wardrobe", aliases: ["wardrobe"] },
  { term: "Finance", aliases: ["finance"] },
  { term: "衣橱", aliases: ["衣柜"] },
  { term: "记账", aliases: ["计账"] },
  { term: "目录", aliases: [] },
  { term: "话题", aliases: [] },
  { term: "交付文件", aliases: ["交付的文件"] },
]);

const CJK_HOMOPHONE_ALIAS_CHARS = Object.freeze({
  吴: ["无", "武", "五", "吾", "伍"],
  萍: ["平", "凭", "苹", "屏", "评"],
});

const CJK_PINYIN = Object.freeze({
  阿: "a",
  艾: "ai", 爱: "ai",
  安: "an",
  昂: "ang",
  奥: "ao",
  白: "bai", 柏: "bai",
  班: "ban", 半: "ban", 伴: "ban",
  邦: "bang",
  包: "bao", 宝: "bao", 保: "bao",
  北: "bei", 贝: "bei", 背: "bei",
  本: "ben",
  崩: "beng",
  比: "bi", 笔: "bi", 必: "bi", 毕: "bi", 闭: "bi",
  边: "bian", 变: "bian", 编: "bian",
  表: "biao", 标: "biao",
  别: "bie",
  宾: "bin", 彬: "bin",
  冰: "bing", 兵: "bing", 并: "bing", 病: "bing",
  波: "bo", 博: "bo", 伯: "bo", 柏: "bo",
  不: "bu", 步: "bu", 布: "bu",
  才: "cai", 财: "cai", 采: "cai",
  参: "can", 残: "can",
  仓: "cang", 苍: "cang",
  曹: "cao", 草: "cao",
  册: "ce",
  岑: "cen",
  曾: "ceng", 层: "ceng",
  查: "cha", 茶: "cha", 差: "cha",
  柴: "chai",
  产: "chan", 禅: "chan", 单: "chan",
  常: "chang", 长: "chang", 昌: "chang", 畅: "chang",
  超: "chao", 朝: "chao",
  车: "che", 彻: "che",
  陈: "chen", 晨: "chen", 辰: "chen", 沉: "chen",
  成: "cheng", 程: "cheng", 城: "cheng", 诚: "cheng", 承: "cheng",
  吃: "chi", 池: "chi", 持: "chi", 迟: "chi", 赤: "chi",
  冲: "chong", 重: "chong", 崇: "chong",
  抽: "chou", 周: "chou",
  初: "chu", 楚: "chu", 储: "chu", 出: "chu",
  传: "chuan", 川: "chuan", 船: "chuan",
  窗: "chuang", 创: "chuang",
  春: "chun", 纯: "chun",
  戳: "chuo",
  次: "ci", 慈: "ci", 辞: "ci", 词: "ci",
  从: "cong", 聪: "cong",
  凑: "cou",
  粗: "cu", 促: "cu",
  崔: "cui", 翠: "cui",
  村: "cun",
  错: "cuo",
  达: "da", 大: "da",
  代: "dai", 戴: "dai", 带: "dai",
  单: "dan", 丹: "dan", 旦: "dan", 淡: "dan",
  当: "dang", 党: "dang",
  道: "dao", 到: "dao", 岛: "dao", 导: "dao",
  德: "de", 的: "de",
  邓: "deng", 登: "deng", 灯: "deng",
  地: "di", 迪: "di", 第: "di", 帝: "di",
  点: "dian", 典: "dian", 电: "dian",
  调: "diao", 雕: "diao",
  丁: "ding", 定: "ding", 鼎: "ding",
  东: "dong", 董: "dong", 动: "dong",
  都: "dou", 斗: "dou",
  杜: "du", 度: "du", 都: "du", 读: "du",
  段: "duan", 端: "duan",
  对: "dui",
  敦: "dun", 顿: "dun",
  多: "duo", 朵: "duo",
  俄: "e", 娥: "e",
  恩: "en",
  而: "er", 二: "er", 尔: "er",
  发: "fa", 法: "fa",
  凡: "fan", 帆: "fan", 樊: "fan", 范: "fan", 反: "fan",
  方: "fang", 房: "fang", 芳: "fang", 放: "fang",
  飞: "fei", 菲: "fei", 斐: "fei", 非: "fei",
  分: "fen", 芬: "fen", 奋: "fen",
  风: "feng", 冯: "feng", 峰: "feng", 丰: "feng", 凤: "feng",
  佛: "fo",
  夫: "fu", 福: "fu", 付: "fu", 傅: "fu", 富: "fu", 浮: "fu",
  该: "gai",
  甘: "gan", 干: "gan", 感: "gan",
  刚: "gang", 钢: "gang", 港: "gang",
  高: "gao", 告: "gao",
  戈: "ge", 哥: "ge", 歌: "ge", 革: "ge", 格: "ge",
  给: "gei",
  根: "gen",
  更: "geng", 耿: "geng",
  工: "gong", 公: "gong", 宫: "gong", 龚: "gong", 供: "gong",
  古: "gu", 顾: "gu", 谷: "gu", 固: "gu",
  关: "guan", 官: "guan", 管: "guan",
  光: "guang", 广: "guang",
  贵: "gui", 桂: "gui", 归: "gui",
  国: "guo", 郭: "guo", 过: "guo",
  哈: "ha",
  海: "hai", 害: "hai",
  韩: "han", 寒: "han", 汉: "han", 涵: "han",
  航: "hang", 杭: "hang",
  好: "hao", 郝: "hao", 浩: "hao", 豪: "hao", 昊: "hao",
  和: "he", 何: "he", 贺: "he", 河: "he",
  黑: "hei",
  很: "hen",
  横: "heng", 衡: "heng", 恒: "heng",
  红: "hong", 洪: "hong", 宏: "hong", 鸿: "hong",
  后: "hou", 侯: "hou", 厚: "hou",
  胡: "hu", 湖: "hu", 虎: "hu", 护: "hu",
  花: "hua", 华: "hua", 化: "hua",
  怀: "huai",
  欢: "huan", 环: "huan", 换: "huan", 桓: "huan",
  黄: "huang", 晃: "huang",
  会: "hui", 惠: "hui", 慧: "hui", 辉: "hui", 回: "hui",
  婚: "hun", 昏: "hun",
  霍: "huo", 火: "huo", 活: "huo",
  机: "ji", 吉: "ji", 记: "ji", 纪: "ji", 季: "ji", 继: "ji", 佳: "jia",
  家: "jia", 嘉: "jia", 加: "jia", 贾: "jia", 甲: "jia",
  建: "jian", 健: "jian", 剑: "jian", 见: "jian", 件: "jian", 简: "jian", 坚: "jian", 兼: "jian",
  江: "jiang", 蒋: "jiang", 姜: "jiang", 将: "jiang",
  娇: "jiao", 交: "jiao", 焦: "jiao", 教: "jiao", 角: "jiao",
  杰: "jie", 洁: "jie", 捷: "jie", 解: "jie", 介: "jie",
  金: "jin", 今: "jin", 津: "jin", 锦: "jin", 晋: "jin", 进: "jin",
  京: "jing", 静: "jing", 晶: "jing", 景: "jing", 经: "jing", 敬: "jing",
  炯: "jiong",
  久: "jiu", 九: "jiu", 酒: "jiu", 旧: "jiu",
  居: "ju", 菊: "ju", 具: "ju", 举: "ju", 巨: "ju",
  军: "jun", 君: "jun", 俊: "jun", 峻: "jun",
  卡: "ka",
  开: "kai", 凯: "kai",
  看: "kan",
  康: "kang",
  考: "kao",
  可: "ke", 柯: "ke", 科: "ke", 克: "ke",
  肯: "ken",
  坑: "keng",
  空: "kong", 孔: "kong",
  口: "kou",
  库: "ku", 苦: "ku",
  快: "kuai",
  宽: "kuan",
  匡: "kuang", 况: "kuang",
  坤: "kun", 昆: "kun",
  阔: "kuo",
  拉: "la",
  来: "lai", 赖: "lai",
  兰: "lan", 蓝: "lan", 岚: "lan", 览: "lan",
  郎: "lang", 朗: "lang",
  老: "lao",
  乐: "le", 勒: "le",
  雷: "lei", 蕾: "lei",
  冷: "leng",
  李: "li", 丽: "li", 利: "li", 立: "li", 礼: "li", 黎: "li", 力: "li", 理: "li",
  连: "lian", 联: "lian", 莲: "lian", 练: "lian",
  梁: "liang", 良: "liang", 亮: "liang",
  林: "lin", 琳: "lin", 临: "lin",
  刘: "liu", 柳: "liu", 流: "liu", 留: "liu",
  龙: "long", 隆: "long",
  楼: "lou", 娄: "lou",
  鲁: "lu", 陆: "lu", 路: "lu", 露: "lu",
  吕: "lv", 绿: "lv", 律: "lv",
  罗: "luo", 洛: "luo", 骆: "luo",
  马: "ma", 麻: "ma",
  麦: "mai", 买: "mai",
  曼: "man", 满: "man",
  忙: "mang",
  毛: "mao", 茂: "mao",
  梅: "mei", 美: "mei", 媚: "mei",
  门: "men",
  孟: "meng", 梦: "meng", 蒙: "meng",
  米: "mi", 密: "mi",
  面: "mian", 棉: "mian",
  苗: "miao", 妙: "miao",
  民: "min", 敏: "min", 闵: "min",
  明: "ming", 名: "ming", 铭: "ming",
  莫: "mo", 墨: "mo", 默: "mo", 摩: "mo",
  某: "mou", 牟: "mou",
  木: "mu", 牧: "mu", 慕: "mu",
  娜: "na", 那: "na",
  奶: "nai", 耐: "nai",
  南: "nan", 男: "nan",
  囊: "nang",
  脑: "nao",
  呢: "ne",
  内: "nei",
  能: "neng",
  倪: "ni", 你: "ni", 尼: "ni",
  年: "nian", 念: "nian",
  娘: "niang",
  鸟: "niao",
  聂: "nie",
  宁: "ning", 凝: "ning",
  牛: "niu",
  农: "nong",
  努: "nu",
  女: "nv",
  欧: "ou",
  潘: "pan", 盘: "pan",
  庞: "pang",
  裴: "pei", 培: "pei",
  彭: "peng", 鹏: "peng", 朋: "peng",
  皮: "pi", 平: "ping", 萍: "ping", 凭: "ping", 苹: "ping", 评: "ping", 屏: "ping",
  朴: "pu", 普: "pu",
  齐: "qi", 起: "qi", 启: "qi", 祈: "qi", 琪: "qi", 奇: "qi", 企: "qi", 其: "qi",
  钱: "qian", 前: "qian", 倩: "qian", 乾: "qian",
  强: "qiang", 墙: "qiang",
  乔: "qiao", 巧: "qiao", 桥: "qiao",
  秦: "qin", 琴: "qin", 勤: "qin", 青: "qing", 清: "qing", 庆: "qing", 晴: "qing", 卿: "qing",
  邱: "qiu", 秋: "qiu", 球: "qiu",
  曲: "qu", 渠: "qu",
  全: "quan", 权: "quan", 泉: "quan",
  群: "qun",
  冉: "ran", 然: "ran",
  让: "rang",
  饶: "rao",
  热: "re",
  任: "ren", 仁: "ren",
  荣: "rong", 融: "rong",
  柔: "rou",
  如: "ru", 茹: "ru", 汝: "ru",
  阮: "ruan",
  瑞: "rui", 睿: "rui",
  润: "run",
  若: "ruo",
  萨: "sa",
  赛: "sai",
  三: "san",
  桑: "sang",
  色: "se",
  森: "sen",
  沙: "sha", 莎: "sha",
  山: "shan", 善: "shan", 珊: "shan", 单: "shan",
  尚: "shang", 商: "shang",
  邵: "shao", 少: "shao", 绍: "shao",
  申: "shen", 沈: "shen", 深: "shen", 神: "shen",
  生: "sheng", 胜: "sheng", 盛: "sheng", 升: "sheng",
  石: "shi", 史: "shi", 师: "shi", 施: "shi", 诗: "shi", 世: "shi", 士: "shi", 时: "shi", 是: "shi",
  收: "shou", 寿: "shou",
  书: "shu", 舒: "shu", 树: "shu", 淑: "shu", 叔: "shu",
  双: "shuang",
  水: "shui",
  顺: "shun",
  司: "si", 思: "si", 斯: "si", 四: "si",
  松: "song", 宋: "song",
  苏: "su", 素: "su",
  孙: "sun",
  索: "suo",
  塔: "ta",
  台: "tai", 泰: "tai",
  谭: "tan", 谈: "tan", 坦: "tan",
  唐: "tang", 堂: "tang",
  陶: "tao", 涛: "tao",
  特: "te",
  腾: "teng",
  提: "ti", 体: "ti", 天: "tian", 田: "tian", 添: "tian",
  条: "tiao",
  铁: "tie",
  听: "ting", 庭: "ting", 廷: "ting", 婷: "ting",
  同: "tong", 童: "tong", 桐: "tong", 彤: "tong",
  头: "tou",
  图: "tu", 涂: "tu",
  团: "tuan",
  推: "tui",
  屯: "tun",
  托: "tuo",
  瓦: "wa",
  外: "wai",
  万: "wan", 晚: "wan", 婉: "wan",
  王: "wang", 望: "wang",
  魏: "wei", 伟: "wei", 维: "wei", 薇: "wei", 威: "wei", 为: "wei",
  文: "wen", 闻: "wen", 温: "wen",
  翁: "weng",
  吴: "wu", 无: "wu", 武: "wu", 伍: "wu", 吾: "wu", 五: "wu", 物: "wu",
  西: "xi", 席: "xi", 习: "xi", 希: "xi", 喜: "xi", 夕: "xi",
  夏: "xia", 霞: "xia", 下: "xia",
  先: "xian", 仙: "xian", 贤: "xian", 显: "xian", 现: "xian",
  向: "xiang", 湘: "xiang", 香: "xiang", 祥: "xiang", 想: "xiang",
  小: "xiao", 肖: "xiao", 萧: "xiao", 晓: "xiao", 笑: "xiao",
  谢: "xie", 协: "xie", 叶: "xie",
  辛: "xin", 新: "xin", 心: "xin", 鑫: "xin", 欣: "xin", 信: "xin", 薪: "xin",
  邢: "xing", 星: "xing", 兴: "xing", 行: "xing",
  熊: "xiong",
  徐: "xu", 许: "xu", 旭: "xu", 续: "xu", 序: "xu", 煦: "xu",
  轩: "xuan", 宣: "xuan", 玄: "xuan",
  薛: "xue", 学: "xue", 雪: "xue",
  寻: "xun", 迅: "xun",
  雅: "ya", 亚: "ya",
  严: "yan", 颜: "yan", 言: "yan", 燕: "yan", 岩: "yan", 艳: "yan",
  杨: "yang", 阳: "yang", 洋: "yang", 央: "yang",
  姚: "yao", 瑶: "yao", 耀: "yao",
  叶: "ye", 业: "ye", 野: "ye",
  伊: "yi", 一: "yi", 依: "yi", 怡: "yi", 义: "yi", 艺: "yi", 易: "yi", 亦: "yi",
  银: "yin", 音: "yin", 尹: "yin", 殷: "yin",
  英: "ying", 颖: "ying", 莹: "ying", 影: "ying", 应: "ying",
  永: "yong", 勇: "yong", 咏: "yong",
  尤: "you", 游: "you", 友: "you", 佑: "you",
  于: "yu", 余: "yu", 鱼: "yu", 雨: "yu", 宇: "yu", 玉: "yu", 俞: "yu", 裕: "yu",
  袁: "yuan", 元: "yuan", 原: "yuan", 远: "yuan", 圆: "yuan",
  岳: "yue", 月: "yue", 越: "yue", 悦: "yue",
  云: "yun", 芸: "yun", 运: "yun",
  曾: "zeng", 增: "zeng",
  张: "zhang", 章: "zhang", 长: "zhang",
  赵: "zhao", 招: "zhao", 昭: "zhao",
  郑: "zheng", 正: "zheng", 政: "zheng", 征: "zheng",
  中: "zhong", 忠: "zhong", 钟: "zhong", 终: "zhong", 仲: "zhong", 众: "zhong",
  周: "zhou", 州: "zhou", 舟: "zhou",
  朱: "zhu", 诸: "zhu", 珠: "zhu", 主: "zhu",
  庄: "zhuang", 壮: "zhuang",
  卓: "zhuo",
  子: "zi", 梓: "zi", 紫: "zi", 资: "zi",
  宗: "zong",
  邹: "zou", 走: "zou",
  祖: "zu",
  左: "zuo", 佐: "zuo",
});

function containsStructuredSpan(text) {
  const value = String(text || "");
  return (
    /https?:\/\/|www\./i.test(value)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    || /(?:^|[\s"'`])(?:\/[^\s]+|~\/[^\s]+|\.[/\\][^\s]+|[A-Za-z]:\\[^\s]+)/.test(value)
    || /[¥$€£]\s*\d|\d+(?:\.\d+)?\s*(?:元|块|美元|usd|rmb|人民币|%)/i.test(value)
    || /\d{1,4}[-/.年]\d{1,2}|\d{1,2}[:：]\d{2}|(?:今天|明天|昨天|周[一二三四五六日天]|星期[一二三四五六日天])/.test(value)
    || /[`{}<>]|=>|&&|\|\||\b(?:function|const|let|var|class|import|export|return)\b/.test(value)
    || /(?:^|\n)\s*(?:git|npm|node|curl|ssh|scp|rm|mv|cp|python|pip)\s+\S+/.test(value)
  );
}

function diffSingleReplacement(sourceText, targetText) {
  const source = normalizeText(sourceText);
  const target = normalizeText(targetText);
  if (!source || !target || source === target) return null;

  let prefix = 0;
  const maxPrefix = Math.min(source.length, target.length);
  while (prefix < maxPrefix && source[prefix] === target[prefix]) prefix += 1;

  let sourceSuffix = source.length - 1;
  let targetSuffix = target.length - 1;
  while (sourceSuffix >= prefix && targetSuffix >= prefix && source[sourceSuffix] === target[targetSuffix]) {
    sourceSuffix -= 1;
    targetSuffix -= 1;
  }

  const from = source.slice(prefix, sourceSuffix + 1).trim();
  const to = target.slice(prefix, targetSuffix + 1).trim();
  if (!from || !to || from === to) return null;
  return { from, to };
}

function candidateIsSafe(candidate, options = {}) {
  if (!candidate) return false;
  const minChars = Math.max(1, Number(options.minChars || 2) || 2);
  const maxChars = Math.max(minChars, Number(options.maxChars || 20) || 20);
  if (candidate.from.length < minChars || candidate.to.length < minChars) return false;
  if (candidate.from.length > maxChars || candidate.to.length > maxChars) return false;
  if (containsStructuredSpan(candidate.from) || containsStructuredSpan(candidate.to)) return false;
  return true;
}

function normalizePhraseTerm(value, maxLength = 80) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`“”‘’【】()[\]{}<>]+|[\s"'`“”‘’【】()[\]{}<>，。；：、.!?:;]+$/g, "")
    .trim()
    .slice(0, maxLength);
}

function phraseIsSafe(term) {
  const value = normalizePhraseTerm(term);
  if (value.length < 2 || value.length > 40) return false;
  if (containsStructuredSpan(value)) return false;
  if (/^\d+$/.test(value)) return false;
  if (/^[\p{P}\p{S}\s]+$/u.test(value)) return false;
  return /[\p{L}\p{N}\u4e00-\u9fff]/u.test(value);
}

function phraseKeyFor(entry) {
  return [
    entry.actorId,
    entry.workspaceId,
    entry.surfaceType || "",
    entry.pluginId || "",
    entry.threadId || "",
    entry.language || "",
    entry.source || "",
    String(entry.term || "").toLocaleLowerCase(),
  ].join("\u001f");
}

function scopeKeyFor(entry) {
  return [
    entry.actorId,
    entry.workspaceId,
    entry.surfaceType,
    entry.pluginId || "",
    entry.threadId || "",
    entry.language || "",
    entry.from,
    entry.to,
  ].join("\u001f");
}

function scopeMatches(entry, scope) {
  if (entry.actorId && entry.actorId !== scope.actorId) return false;
  if (entry.workspaceId !== scope.workspaceId) return false;
  if (entry.surfaceType && entry.surfaceType !== scope.surfaceType) return false;
  if (entry.pluginId && entry.pluginId !== scope.pluginId) return false;
  if (entry.threadId && entry.threadId !== scope.threadId) return false;
  if (entry.language && scope.language && entry.language !== scope.language) return false;
  return true;
}

function scopeGuardRequested(input = {}) {
  return Boolean(
    input.actorId || input.actor_id
    || input.workspaceId || input.workspace_id
    || input.surfaceType || input.surface_type
    || input.pluginId || input.plugin_id
    || input.threadId || input.thread_id
  );
}

function ensureVoiceInputState(runtimeState) {
  const root = isPlainObject(runtimeState) ? runtimeState : {};
  if (!isPlainObject(root.voiceInput)) root.voiceInput = {};
  if (!Array.isArray(root.voiceInput.corrections)) root.voiceInput.corrections = [];
  if (!Array.isArray(root.voiceInput.phrasebook)) root.voiceInput.phrasebook = [];
  if (!Array.isArray(root.voiceInput.audit)) root.voiceInput.audit = [];
  return root.voiceInput;
}

function publicCorrection(entry) {
  return {
    id: entry.id,
    actorId: entry.actorId,
    workspaceId: entry.workspaceId,
    surfaceType: entry.surfaceType,
    pluginId: entry.pluginId || "",
    threadId: entry.threadId || "",
    language: entry.language || "",
    from: entry.from,
    to: entry.to,
    status: entry.status,
    supportCount: entry.supportCount,
    rejectionCount: entry.rejectionCount || 0,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastSeenAt: entry.lastSeenAt || "",
    lastAppliedAt: entry.lastAppliedAt || "",
  };
}

function publicPhrase(entry) {
  return {
    id: entry.id,
    actorId: entry.actorId,
    workspaceId: entry.workspaceId,
    surfaceType: entry.surfaceType,
    pluginId: entry.pluginId || "",
    threadId: entry.threadId || "",
    language: entry.language || "",
    term: entry.term,
    source: entry.source || "sent_text",
    status: entry.status,
    supportCount: entry.supportCount,
    aliases: Array.isArray(entry.aliases) ? entry.aliases.slice(0, 12) : [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastSeenAt: entry.lastSeenAt || "",
    lastAppliedAt: entry.lastAppliedAt || "",
  };
}

function uniquePhrases(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const term = normalizePhraseTerm(item);
    const key = term.toLocaleLowerCase();
    if (!phraseIsSafe(term) || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

function cjkOnlyText(value) {
  return /^[\u4e00-\u9fff]{2,6}$/.test(String(value || ""));
}

function cjkPinyinTokens(value) {
  const chars = Array.from(String(value || ""));
  if (!chars.length || !chars.every((char) => /[\u4e00-\u9fff]/u.test(char))) return [];
  const tokens = [];
  for (const char of chars) {
    const pinyin = CJK_PINYIN[char];
    if (!pinyin) return [];
    tokens.push(pinyin);
  }
  return tokens;
}

function cjkPinyinKey(value) {
  const tokens = cjkPinyinTokens(value);
  return tokens.length ? tokens.join("'") : "";
}

function generatedCjkHomophoneAliases(term) {
  const value = normalizePhraseTerm(term);
  if (!cjkOnlyText(value)) return [];
  const variants = [""];
  for (const char of Array.from(value)) {
    const replacements = CJK_HOMOPHONE_ALIAS_CHARS[char] || [];
    const choices = [char, ...replacements].slice(0, 4);
    const next = [];
    for (const prefix of variants) {
      for (const choice of choices) next.push(`${prefix}${choice}`);
    }
    variants.splice(0, variants.length, ...next.slice(0, 32));
  }
  return uniquePhrases(variants.filter((item) => item !== value)).slice(0, 12);
}

function cjkPunctuationOrSpace(value) {
  return !value || /^[，。！？、；：,.!?;:\s]$/u.test(value);
}

function cjkWholeUtteranceSpan(value, start, end) {
  const before = value.slice(0, start);
  const after = value.slice(end);
  return /^[\s，。！？、；：,.!?;:]*$/u.test(before) && /^[\s，。！？、；：,.!?;:]*$/u.test(after);
}

function cjkContextHasDenyPhrase(value, start, end, source) {
  const around = value.slice(Math.max(0, start - 4), Math.min(value.length, end + 4));
  const denyPhrases = [
    "无凭无据",
    "平平无奇",
    "凭空",
    "无凭证",
    "无凭据",
    "五平米",
    "平方",
    "凭证",
  ];
  return denyPhrases.some((phrase) => around.includes(phrase) || (source && phrase.includes(source)));
}

function cjkSafePinyinReplacementAllowed(value, start, end, source, term, supportCount) {
  if (!source || !term || source === term) return false;
  if (!cjkOnlyText(source) || !cjkOnlyText(term) || source.length !== term.length) return false;
  if (containsStructuredSpan(value)) return false;
  if (cjkContextHasDenyPhrase(value, start, end, source)) return false;
  if (cjkWholeUtteranceSpan(value, start, end)) return true;

  const before = value[start - 1] || "";
  const after = value[end] || "";
  const afterNext = value[end + 1] || "";
  if (cjkPunctuationOrSpace(before) && (cjkPunctuationOrSpace(after) || /^[是的在和跟与要会不吗呢吧了有就都给把被里上下中]/u.test(after))) {
    return true;
  }
  if (Number(supportCount || 0) >= 3 && source.length <= 4) {
    if (/^[\u4e00-\u9fff]$/u.test(before) && /^[\u4e00-\u9fff]$/u.test(after)) {
      return !/^[无不没非未]$/u.test(before) && !/^[证据故法论理效关]$/u.test(after);
    }
    if (/^[\u4e00-\u9fff]$/u.test(before) && !after) return true;
    if (!before && /^[\u4e00-\u9fff]$/u.test(after)) return !/^[证据故法论理效关]/u.test(after + afterNext);
  }
  return false;
}

function cjkPinyinPhrasebookReplacement(text, entry) {
  const term = normalizePhraseTerm(entry?.term);
  if (!cjkOnlyText(term)) return { text, applied: false, source: "" };
  const termKey = cjkPinyinKey(term);
  if (!termKey) return { text, applied: false, source: "" };
  const value = String(text || "");
  if (!value || value.length > 240 || containsStructuredSpan(value)) return { text, applied: false, source: "" };
  const chars = Array.from(value);
  const termLength = Array.from(term).length;
  let offset = 0;
  for (let index = 0; index <= chars.length - termLength; index += 1) {
    const spanChars = chars.slice(index, index + termLength);
    const source = spanChars.join("");
    const start = offset;
    const end = start + source.length;
    if (
      source !== term
      && cjkOnlyText(source)
      && cjkPinyinKey(source) === termKey
      && cjkSafePinyinReplacementAllowed(value, start, end, source, term, entry?.supportCount)
    ) {
      return {
        text: `${value.slice(0, start)}${term}${value.slice(end)}`,
        applied: true,
        source,
      };
    }
    offset += chars[index].length;
  }
  return { text, applied: false, source: "" };
}

function cjkExactAliasReplacement(text, alias, term) {
  if (!cjkOnlyText(alias) || !cjkOnlyText(term) || alias.length !== term.length) return "";
  const value = String(text || "");
  const match = value.match(/^(\s*)([\u4e00-\u9fff]{2,4})([，。！？,.!?]?\s*)$/u);
  if (!match || match[2] !== alias) return "";
  return `${match[1]}${term}${match[3]}`;
}

function cjkBoundedAliasReplacement(text, alias, term) {
  const exact = cjkExactAliasReplacement(text, alias, term);
  if (exact) return exact;
  if (!cjkOnlyText(alias) || !cjkOnlyText(term) || alias.length !== term.length) return "";
  const value = String(text || "");
  const cjkBoundaryAfter = "[是的在和跟与要会不吗呢吧了有就都给把被里上下中，。！？、；：,.!?;:\\s]|$";
  const pattern = new RegExp(`(^|[，。！？、；：,.!?;:\\s])(${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=${cjkBoundaryAfter})`, "u");
  return pattern.test(value) ? value.replace(pattern, `$1${term}`) : "";
}

function extractPhraseCandidatesFromText(text, options = {}) {
  const value = normalizeText(text, 8000);
  if (!value) return [];
  const candidates = [];
  const latinPattern = /\b(?:[A-Z][A-Za-z0-9]*(?:[ -][A-Z0-9][A-Za-z0-9]*){0,1}|[A-Z]{2,8}|[A-Za-z]+(?:[ -](?:AI|API|MCP|PWA|CLI|UI|ASR|LLM|OAuth|Codex|Gateway|Home)){1,2})\b/g;
  for (const match of value.matchAll(latinPattern)) {
    candidates.push(match[0]);
  }
  const cjkChunks = value
    .split(/[，。！？、；：,.!?;:\n\r\t()[\]{}"'`“”‘’<>]+/)
    .map((part) => normalizePhraseTerm(part, 40))
    .filter((part) => part.length >= 2 && part.length <= 12);
  for (const chunk of cjkChunks) {
    if (/^[\u4e00-\u9fffA-Za-z0-9 ]+$/.test(chunk)) candidates.push(chunk);
  }
  const explicit = Array.isArray(options.candidates) ? options.candidates : [];
  return uniquePhrases([...explicit, ...candidates]).slice(0, 16);
}

function createVoiceInputCorrectionService(options = {}) {
  const state = typeof options.state === "function" ? options.state : () => ({});
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const makeId = typeof options.makeId === "function" ? options.makeId : (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const autoApplySupportCount = Math.max(2, Number(options.autoApplySupportCount || 3) || 3);
  const maxCorrections = Math.max(20, Number(options.maxCorrections || 1000) || 1000);
  const phraseActiveSupportCount = Math.max(2, Number(options.phraseActiveSupportCount || 2) || 2);
  const maxPhrases = Math.max(50, Number(options.maxPhrases || 2000) || 2000);
  const systemPhrases = Array.isArray(options.systemPhrases) ? options.systemPhrases : DEFAULT_SYSTEM_PHRASES;

  function voiceStore() {
    return ensureVoiceInputState(state());
  }

  function extractCorrectionCandidates(input = {}) {
    const candidate = diffSingleReplacement(input.sourceText, input.targetText);
    if (!candidateIsSafe(candidate, input)) return [];
    return [candidate];
  }

  function recordCorrectionEvidence(input = {}) {
    const scope = normalizeScope(input);
    const candidates = Array.isArray(input.candidates) && input.candidates.length
      ? input.candidates.filter((candidate) => candidateIsSafe(candidate, input))
      : extractCorrectionCandidates(input);
    if (!candidates.length) return { ok: true, recorded: [] };

    const store = voiceStore();
    const byKey = new Map(store.corrections.map((entry) => [scopeKeyFor(entry), entry]));
    const recorded = [];
    const now = nowIso();
    for (const candidate of candidates.slice(0, 8)) {
      const next = {
        id: "",
        actorId: scope.actorId,
        workspaceId: scope.workspaceId,
        surfaceType: scope.surfaceType,
        pluginId: scope.pluginId,
        threadId: scope.threadId,
        language: scope.language,
        from: candidate.from,
        to: candidate.to,
      };
      const key = scopeKeyFor(next);
      const existing = byKey.get(key);
      if (existing) {
        existing.supportCount = Math.max(1, Number(existing.supportCount || 0) + 1);
        existing.lastSeenAt = now;
        existing.updatedAt = now;
        if (existing.status !== "disabled" && existing.supportCount >= autoApplySupportCount) existing.status = "active";
        recorded.push(publicCorrection(existing));
        continue;
      }
      const entry = Object.assign(next, {
        id: makeId("voice_correction"),
        status: "suggest_only",
        supportCount: 1,
        rejectionCount: 0,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        lastAppliedAt: "",
      });
      store.corrections.unshift(entry);
      recorded.push(publicCorrection(entry));
    }
    store.corrections = store.corrections.slice(0, maxCorrections);
    saveState();
    return { ok: true, recorded };
  }

  function upsertPhrase(input = {}) {
    const scope = normalizeScope(input);
    const source = cleanString(input.source || "sent_text", 40) || "sent_text";
    const term = normalizePhraseTerm(input.term);
    if (!phraseIsSafe(term)) return null;
    const now = nowIso();
    const aliases = uniquePhrases(Array.isArray(input.aliases) ? input.aliases : []);
    const next = {
      id: "",
      actorId: source === "system_seed" ? "" : scope.actorId,
      workspaceId: scope.workspaceId,
      surfaceType: source === "system_seed" ? "" : scope.surfaceType,
      pluginId: source === "system_seed" ? "" : scope.pluginId,
      threadId: source === "system_seed" ? "" : scope.threadId,
      language: scope.language,
      term,
      source,
    };
    const store = voiceStore();
    const byKey = new Map(store.phrasebook.map((entry) => [phraseKeyFor(entry), entry]));
    const existing = byKey.get(phraseKeyFor(next));
    if (existing) {
      existing.supportCount = Math.max(1, Number(existing.supportCount || 0) + Number(input.supportCount || 1));
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      const aliasSet = new Set([...(existing.aliases || []), ...aliases].map((alias) => normalizePhraseTerm(alias)).filter(phraseIsSafe));
      existing.aliases = Array.from(aliasSet).slice(0, 12);
      if (existing.status !== "disabled" && (source === "system_seed" || existing.supportCount >= phraseActiveSupportCount)) existing.status = "active";
      return publicPhrase(existing);
    }
    const entry = Object.assign(next, {
      id: makeId(source === "system_seed" ? "voice_phrase_system" : "voice_phrase"),
      status: source === "system_seed" ? "active" : "suggest_only",
      supportCount: Math.max(1, Number(input.supportCount || (source === "system_seed" ? phraseActiveSupportCount : 1)) || 1),
      aliases,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      lastAppliedAt: "",
    });
    if (entry.supportCount >= phraseActiveSupportCount && entry.status !== "disabled") entry.status = "active";
    store.phrasebook.unshift(entry);
    store.phrasebook = store.phrasebook.slice(0, maxPhrases);
    return publicPhrase(entry);
  }

  function seedSystemPhrasebook(scopeInput = {}) {
    const recorded = [];
    for (const item of systemPhrases) {
      const term = typeof item === "string" ? item : item?.term;
      const aliases = typeof item === "string" ? [] : item?.aliases;
      const phrase = upsertPhrase(Object.assign({}, scopeInput, {
        term,
        aliases,
        source: "system_seed",
        supportCount: phraseActiveSupportCount,
      }));
      if (phrase) recorded.push(phrase);
    }
    if (recorded.length) saveState();
    return { ok: true, recorded };
  }

  function recordSentTextEvidence(input = {}) {
    const text = normalizeText(input.text || input.finalText || input.final_text, 8000);
    const phrases = extractPhraseCandidatesFromText(text, input);
    if (!phrases.length) return { ok: true, recorded: [] };
    const recorded = [];
    for (const phrase of phrases) {
      const entry = upsertPhrase(Object.assign({}, input, {
        term: phrase,
        source: "sent_text",
      }));
      if (entry) recorded.push(entry);
    }
    if (recorded.length) saveState();
    return { ok: true, recorded };
  }

  function activePhraseEntries(scope) {
    return voiceStore().phrasebook
      .filter((entry) => entry && entry.status !== "disabled" && scopeMatches(entry, scope))
      .filter((entry) => entry.term && (entry.status === "active" || entry.source === "system_seed"));
  }

  function applyPhrasebook(text, scope) {
    let nextText = text;
    const applied = [];
    const now = nowIso();
    const phrases = activePhraseEntries(scope);
    phrases.sort((a, b) => String(b.term || "").length - String(a.term || "").length);
    for (const entry of phrases.slice(0, 80)) {
      const aliases = uniquePhrases([
        ...(entry.aliases || []),
        ...generatedCjkHomophoneAliases(entry.term),
        entry.term,
      ]).filter((alias) => alias !== entry.term);
      for (const alias of aliases.slice(0, 12)) {
        let replaced = "";
        if (/^[A-Za-z][A-Za-z0-9 +_.-]*$/.test(alias) && /^[A-Za-z][A-Za-z0-9 +_.-]*$/.test(entry.term)) {
          const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
          replaced = nextText.replace(pattern, entry.term);
        } else {
          replaced = cjkBoundedAliasReplacement(nextText, alias, entry.term);
        }
        if (replaced && replaced !== nextText) {
          nextText = replaced;
          entry.lastAppliedAt = now;
          applied.push(publicPhrase(entry));
        }
      }
      const pinyinResult = cjkPinyinPhrasebookReplacement(nextText, entry);
      if (pinyinResult.applied && pinyinResult.text !== nextText) {
        nextText = pinyinResult.text;
        entry.lastAppliedAt = now;
        applied.push(publicPhrase(entry));
      }
    }
    return { text: nextText, applied };
  }

  function applyCorrections(input = {}) {
    const scope = normalizeScope(input);
    let text = normalizeText(input.text);
    const applied = [];
    const suggestions = [];
    if (!text) return { text, applied, suggestions };
    const store = voiceStore();
    const now = nowIso();
    const phraseResult = applyPhrasebook(text, scope);
    text = phraseResult.text;
    const scoped = store.corrections
      .filter((entry) => entry && entry.status !== "disabled" && scopeMatches(entry, scope))
      .filter((entry) => entry.from && entry.to && text.includes(entry.from));
    scoped.sort((a, b) => {
      const aSpecificity = Number(Boolean(a.threadId)) + Number(Boolean(a.pluginId)) + Number(Boolean(a.surfaceType));
      const bSpecificity = Number(Boolean(b.threadId)) + Number(Boolean(b.pluginId)) + Number(Boolean(b.surfaceType));
      return (bSpecificity - aSpecificity) || ((b.supportCount || 0) - (a.supportCount || 0));
    });

    for (const entry of scoped.slice(0, 20)) {
      const replacement = publicCorrection(entry);
      if (entry.status === "active" && Number(entry.supportCount || 0) >= autoApplySupportCount) {
        const nextText = text.split(entry.from).join(entry.to);
        if (nextText !== text) {
          text = nextText;
          entry.lastAppliedAt = now;
          applied.push(replacement);
        }
      } else {
        suggestions.push(replacement);
      }
    }
    if (applied.length || phraseResult.applied.length) saveState();
    return { text, applied, suggestions, phrasebookApplied: phraseResult.applied };
  }

  function listCorrections(scopeInput = {}) {
    const scope = normalizeScope(scopeInput);
    return voiceStore().corrections
      .filter((entry) => scopeMatches(entry, scope))
      .map(publicCorrection);
  }

  function listPhrases(scopeInput = {}) {
    const scope = normalizeScope(scopeInput);
    return voiceStore().phrasebook
      .filter((entry) => scopeMatches(entry, scope) || entry.source === "system_seed")
      .map(publicPhrase);
  }

  function thresholds() {
    return {
      correctionAutoApplySupportCount: autoApplySupportCount,
      phraseActiveSupportCount,
      maxPhrases,
      maxCorrections,
    };
  }

  function updateCorrectionStatus(input = {}) {
    const id = cleanString(input.id || input.correctionId || input.correction_id, 120);
    const status = cleanString(input.status, 40);
    if (!id) {
      const err = new Error("voice correction id is required");
      err.status = 400;
      err.code = "voice_correction_id_required";
      throw err;
    }
    if (!["active", "suggest_only", "disabled"].includes(status)) {
      const err = new Error("voice correction status is invalid");
      err.status = 400;
      err.code = "voice_correction_status_invalid";
      throw err;
    }
    const store = voiceStore();
    const entry = store.corrections.find((item) => item?.id === id);
    if (!entry) {
      const err = new Error("voice correction not found");
      err.status = 404;
      err.code = "voice_correction_not_found";
      throw err;
    }
    if (scopeGuardRequested(input) && !scopeMatches(entry, normalizeScope(input))) {
      const err = new Error("voice correction not found");
      err.status = 404;
      err.code = "voice_correction_not_found";
      throw err;
    }
    entry.status = status;
    if (status === "disabled") entry.rejectionCount = Math.max(0, Number(entry.rejectionCount || 0) + 1);
    entry.updatedAt = nowIso();
    saveState();
    return publicCorrection(entry);
  }

  return Object.freeze({
    applyCorrections,
    containsStructuredSpan,
    extractPhraseCandidatesFromText,
    extractCorrectionCandidates,
    listPhrases,
    listCorrections,
    normalizeScope,
    recordCorrectionEvidence,
    recordSentTextEvidence,
    seedSystemPhrasebook,
    thresholds,
    updateCorrectionStatus,
  });
}

module.exports = {
  candidateIsSafe,
  cjkPinyinKey,
  cjkPinyinPhrasebookReplacement,
  containsStructuredSpan,
  createVoiceInputCorrectionService,
  diffSingleReplacement,
  extractPhraseCandidatesFromText,
  normalizeScope,
};
