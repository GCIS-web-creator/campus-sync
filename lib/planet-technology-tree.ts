export type PlanetTechnologyNodeType = 'root' | 'branch' | 'technology';
export type PlanetTechnologyNodeState = 'available' | 'stage_locked' | 'parent_locked' | 'purchased';

export type PlanetTechnologyNode = {
  id: string;
  branchId: string;
  nodeType: PlanetTechnologyNodeType;
  title: string;
  description: string;
  costMp: number;
  requiredStage: number;
  parentNodeId: string | null;
  themeIndex?: number;
  themeName?: string;
  level?: number;
};

type BranchDefinition = {
  id: string;
  title: string;
  description: string;
  requiredStage: number;
  themes: readonly string[];
};

const BRANCHES: readonly BranchDefinition[] = [
  {
    id: 'agriculture-food', title: '農業・食料', requiredStage: 1,
    description: '食料生産、土壌、栽培、保存、食料供給を発展させる。',
    themes: ['土壌科学', '作物育種', '水耕栽培', '精密農業', '食料保存', '食品加工', '畜産システム', '水産養殖', '食料物流', '循環型農業'],
  },
  {
    id: 'water-sanitation', title: '水資源・衛生', requiredStage: 1,
    description: '水の確保、浄化、配水、衛生インフラを整える。',
    themes: ['水源調査', '浄水処理', '海水淡水化', '配水網', '排水処理', '水質監視', '衛生設備', '雨水利用', '水循環管理', '災害時給水'],
  },
  {
    id: 'construction-urban', title: '建築・都市', requiredStage: 1,
    description: '住居、建設技術、都市設計、公共空間を整備する。',
    themes: ['基礎建築', '耐震構造', '高層建築', '都市計画', '道路設計', '公共施設', '住宅断熱', '地下空間', 'スマートシティ', '居住環境'],
  },
  {
    id: 'materials-manufacturing', title: '素材・製造', requiredStage: 2,
    description: '素材の発見から高精度な製造と再資源化までを発展させる。',
    themes: ['金属精錬', '合金設計', '高分子材料', 'セラミックス', '複合材料', '精密加工', '積層造形', '品質管理', 'リサイクル素材', 'ナノ材料'],
  },
  {
    id: 'energy', title: 'エネルギー', requiredStage: 2,
    description: '発電、蓄電、送電、省エネルギーの基盤を築く。',
    themes: ['太陽光発電', '風力発電', '水力発電', '地熱利用', '蓄電池', '送電網', '熱利用', '水素エネルギー', '核融合研究', '地域エネルギー網'],
  },
  {
    id: 'transport-logistics', title: '交通・物流', requiredStage: 2,
    description: '人と物の移動を安全かつ効率的につなぐ。',
    themes: ['道路交通', '鉄道網', '公共交通', '貨物輸送', '港湾物流', '航空輸送', '自動運転', '交通管制', '物流ロボット', '惑星規模輸送'],
  },
  {
    id: 'communication-information', title: '通信・情報', requiredStage: 3,
    description: '通信網、データ基盤、情報共有とサイバー保全を発展させる。',
    themes: ['有線通信', '無線通信', '光通信', '衛星通信', 'データセンター', '分散ネットワーク', '情報検索', 'デジタルID', 'サイバー保全', '惑星情報網'],
  },
  {
    id: 'medicine-life-science', title: '医療・生命科学', requiredStage: 3,
    description: '予防、診断、公衆衛生、生命科学の研究を進める。',
    themes: ['公衆衛生', '診断技術', '医療機器', '創薬研究', '再生医療', '遺伝学', '微生物研究', '医療データ', '遠隔医療', '予防医療システム'],
  },
  {
    id: 'education-science', title: '教育・科学', requiredStage: 3,
    description: '学びの仕組み、基礎科学、研究機関を育てる。',
    themes: ['基礎教育', '個別最適学習', '科学実験', '数学研究', '物理研究', '化学研究', '生物研究', '研究図書館', '学術交流', 'オープンサイエンス'],
  },
  {
    id: 'environment-climate', title: '環境・気候', requiredStage: 4,
    description: '生態系、気候、水と大気の環境を守り、回復させる。',
    themes: ['森林再生', '生物多様性', '土壌回復', '大気観測', '気候モデル', '廃棄物削減', '海洋保全', '環境センサー', '循環経済', '惑星環境管理'],
  },
  {
    id: 'computation-automation', title: '計算・自動化', requiredStage: 4,
    description: '計算基盤、ロボット、制御、意思決定支援を発展させる。',
    themes: ['計算機設計', 'ソフトウェア工学', 'データ解析', '機械学習', 'ロボット工学', '制御システム', 'シミュレーション', '自律システム', '量子計算研究', '統合運用AI'],
  },
  {
    id: 'aerospace', title: '航空・宇宙', requiredStage: 4,
    description: '大気圏飛行、軌道、探査、宇宙インフラを研究する。',
    themes: ['航空力学', '飛行制御', '軽量機体', 'ロケット工学', '軌道力学', '人工衛星', '惑星探査', '宇宙居住', '宇宙資源科学', '恒星間航行研究'],
  },
  {
    id: 'governance-culture', title: '社会制度・文化', requiredStage: 5,
    description: '公共制度、文化、合意形成、長期的な社会運営を整える。',
    themes: ['公共行政', '法制度', '地域自治', '教育制度', '文化保存', '言語交流', '公共経済', '防災制度', '社会福祉', '惑星文明憲章'],
  },
] as const;

const ADVANCEMENTS = [
  '原理の発見', '基礎設計', '実験技術', '実用化', '高効率化',
  '自動化', '統合システム', '高度最適化', '広域展開', '次世代技術',
] as const;

const ROOT_NODE: PlanetTechnologyNode = {
  id: 'root.foundation-research',
  branchId: 'foundation',
  nodeType: 'root',
  title: '基礎研究の確立',
  description: '研究記録、実験方法、知識の共有を整え、13分野へ枝分かれする最初の研究基盤を築く。',
  costMp: 25,
  requiredStage: 1,
  parentNodeId: null,
};

const BRANCH_NODES: PlanetTechnologyNode[] = BRANCHES.map((branch, index) => ({
  id: 'branch.' + branch.id,
  branchId: branch.id,
  nodeType: 'branch',
  title: branch.title + '分野',
  description: branch.description,
  costMp: 35 + index * 2,
  requiredStage: branch.requiredStage,
  parentNodeId: ROOT_NODE.id,
}));

const TECHNOLOGY_NODES: PlanetTechnologyNode[] = BRANCHES.flatMap((branch, branchIndex) =>
  branch.themes.flatMap((theme, themeIndex) =>
    ADVANCEMENTS.map((advancement, advancementIndex) => {
      const level = advancementIndex + 1;
      const parentNodeId = level === 1
        ? 'branch.' + branch.id
        : 'tech.' + branch.id + '.' + String(themeIndex + 1).padStart(2, '0') + '.' + String(level - 1).padStart(2, '0');
      const requiredStage = Math.min(
        5,
        branch.requiredStage + Math.floor(themeIndex / 4) + Math.floor(advancementIndex / 4),
      );
      return {
        id: 'tech.' + branch.id + '.' + String(themeIndex + 1).padStart(2, '0') + '.' + String(level).padStart(2, '0'),
        branchId: branch.id,
        nodeType: 'technology' as const,
        title: theme + '：' + advancement,
        description: theme + '分野の第' + level + '段階。前段階の研究成果を引き継いで、より高度な仕組みを実現する。',
        costMp: 20 + branchIndex * 2 + themeIndex * 2 + level * 3,
        requiredStage,
        parentNodeId,
        themeIndex,
        themeName: theme,
        level,
      };
    }),
  ),
);

export const PLANET_TECHNOLOGY_ROOT_ID = ROOT_NODE.id;
export const PLANET_TECHNOLOGY_BRANCHES = BRANCHES;
export const PLANET_TECHNOLOGY_CATALOG: readonly PlanetTechnologyNode[] = [
  ROOT_NODE,
  ...BRANCH_NODES,
  ...TECHNOLOGY_NODES,
];

const NODE_BY_ID = new Map(PLANET_TECHNOLOGY_CATALOG.map(node => [node.id, node]));

export function getPlanetTechnologyNode(nodeId: string) {
  return NODE_BY_ID.get(nodeId) ?? null;
}

export function getPlanetTechnologyCatalog() {
  return PLANET_TECHNOLOGY_CATALOG;
}

export function getPlanetTechnologyNodeState(
  node: PlanetTechnologyNode,
  civilizationStage: number,
  purchasedNodeIds: ReadonlySet<string>,
): PlanetTechnologyNodeState {
  if (purchasedNodeIds.has(node.id)) return 'purchased';
  if (civilizationStage < node.requiredStage) return 'stage_locked';
  if (node.parentNodeId && !purchasedNodeIds.has(node.parentNodeId)) return 'parent_locked';
  return 'available';
}

export function getPlanetTechnologyBranchNodes() {
  return BRANCH_NODES;
}

export function getPlanetTechnologyNodesForBranch(branchId: string) {
  return TECHNOLOGY_NODES.filter(node => node.branchId === branchId);
}

export function getPlanetTechnologyCatalogCount() {
  return PLANET_TECHNOLOGY_CATALOG.length;
}
