/** REQUESTER (Solicitante) so abre e acompanha as proprias solicitacoes de servico - e'
 * ilimitado em qualquer plano. */
export type Role =
  | "ADMIN"
  | "TECHNICIAN"
  | "COMMERCIAL"
  /** Administrador da empresa cliente - o enum continua CLIENT para nao renomear producao. */
  | "CLIENT"
  | "CLIENT_PLANNER"
  | "CLIENT_TECHNICIAN"
  | "REQUESTER";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  /** Senha provisoria ainda nao trocada: a aplicacao so abre a tela de troca. */
  mustChangePassword?: boolean;
  client: { id: string; companyName: string; tradeName: string | null; contractedServices: ServiceCategory[] } | null;
}

export interface PortalUserRef {
  id: string;
  name: string;
  email: string;
  /** Gestor (usa o CMMS, ocupa vaga) ou Solicitante (so solicitacoes, nao ocupa). */
  role?: Role;
  active: boolean;
  lastLoginAt: string | null;
  /** Quando o acesso foi liberado - a lista mostra ao lado do ultimo acesso. */
  createdAt?: string;
}

export type ClientStatus = "ACTIVE" | "INACTIVE" | "PROSPECT";

/** Situacao do contrato do CMMS - separada do status da empresa no cadastro E do
 * ContractStatus dos contratos de servico da OptiProcess, que e' outra coisa. */
export type CmmsContractStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELED";

export interface ClientRef {
  id: string;
  companyName: string;
  tradeName: string | null;
}

export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  isPrimary: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number | null;
  maxUsers: number | null;
  maxInstruments: number | null;
  features: string[];
  active: boolean;
  createdAt: string;
  _count?: { clients: number };
}

export interface PlanUsage {
  current: number;
  limit: number | null;
}

export interface Client {
  /** Teste, ativo, suspenso ou cancelado. */
  contractStatus?: CmmsContractStatus;
  id: string;
  companyName: string;
  tradeName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  technicalContactName: string | null;
  commercialContactName: string | null;
  status: ClientStatus;
  contractedServices: ServiceCategory[];
  planId: string | null;
  plan?: Plan | null;
  planStartedAt: string | null;
  planUsage?: { users: PlanUsage; instruments: PlanUsage; requesters?: number };
  notes: string | null;
  createdAt: string;
  contacts?: ClientContact[];
  /** Usuarios de portal (role CLIENT) ja vinculados a esta empresa. */
  users?: PortalUserRef[];
  _count?: { instruments: number };
  /** Marca da propria empresa - substitui a marca do RLP Maintenance no painel do CMMS dela. */
  logoUrl?: string | null;
}

export type ServiceCategory =
  | "ELECTRICAL_MAINTENANCE"
  | "PANEL_MAINTENANCE"
  | "MOTOR_MAINTENANCE"
  | "TECHNICAL_REPORT"
  | "CALIBRATION"
  | "TECHNICAL_ASSISTANCE"
  | "EV_CHARGER"
  | "CMMS_MAINTENANCE"
  | "OTHER";

export interface InstrumentRef {
  id: string;
  type: string;
  model: string | null;
  serialNumber: string | null;
  tag: string | null;
  description?: string | null;
  /** Vem junto onde a tela precisa mostrar a criticidade herdada do ativo. */
  criticality?: MaintenancePriority;
}

export type InstrumentStatus = "VALID" | "DUE_SOON" | "EXPIRED" | "IN_MAINTENANCE";
export type OperationalStatus = "IN_OPERATION" | "STOPPED" | "STANDBY" | "DEACTIVATED" | "IN_MAINTENANCE";

export interface Instrument {
  id: string;
  clientId: string;
  client?: ClientRef;
  /** Rotulo curto mostrado ao lado do TAG - acompanha o nivel escolhido. */
  type: string;
  /** Onde o ativo fica na arvore. Vazio = ainda nao classificado (cadastro rapido). */
  level: AssetHierarchyLevel | null;
  tag: string | null;
  /** Nome do ativo em linguagem de gente - junto do TAG e' o que identifica nas telas. */
  description: string | null;
  /** Sujeito a calibracao - so estes aparecem na lista de Ativos da OptiProcess. */
  calibratable: boolean;
  /** Profundidade na arvore (0 = raiz) - so vem na listagem, para o recuo de cada linha. */
  treeDepth?: number;
  /** Quantos filhos (nao removidos) este ativo tem - decide se a arvore sob demanda mostra
   * o "+" de expandir antes mesmo de buscar os filhos. */
  childrenCount?: number;
  /** Tem ponto de lubrificacao - irmao de calibratable. */
  lubricatable?: boolean;
  /** O que falta depois de marcar o ativo (so vem na ficha, nao na listagem). */
  pendencias?: { planoDeCalibracao: boolean; pontoDeLubrificacao: boolean };
  calibrationPlanCount?: number;
  lubricationPointCount?: number;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  measurementRange: string | null;
  resolution: string | null;
  unit: string | null;
  installationLocation: string | null;
  /** Foto principal do ativo - link temporario gerado pelo backend, nao a chave crua. */
  photoUrl?: string | null;
  photoFileName?: string | null;
  calibrationFrequencyMonths: number | null;
  lastCalibrationDate: string | null;
  nextDueDate: string | null;
  status: InstrumentStatus;
  derivedStatus?: InstrumentStatus;
  // Quanto uma parada deste ativo pesa pra empresa - guia prioridade de OS e estoque.
  criticality: MaintenancePriority;
  // Condicao operacional agora - independente do status de calibracao acima.
  operationalStatus: OperationalStatus;
  // Nivel hierarquico resolvido a partir do catalogo AssetType (por nome) - so pra
  // escolher o icone certo na arvore de ativos, ausente quando o tipo nao tem nivel definido.
  assetTypeLevel?: AssetHierarchyLevel | null;
  // Arvore de ativos: um filho e' um Ativo completo apontando para o pai.
  parentId?: string | null;
  parent?: InstrumentRef | null;
  children?: InstrumentRef[];
  // Localizacao/classificacao do ativo (opcionais) - complementam a arvore pai/filho.
  plantId?: string | null;
  plant?: { id: string; name: string } | null;
  areaId?: string | null;
  area?: { id: string; name: string } | null;
  systemId?: string | null;
  system?: { id: string; name: string } | null;
  costCenterId?: string | null;
  costCenter?: { id: string; name: string; code?: string | null } | null;
  /** ADMIN definiu centro de custo diferente do padrao da area - a heranca nao sobrescreve. */
  costCenterOverride?: boolean;
  /** Ficha tecnica que depende do tipo (ex.: potencia de um Motor, relacao de um Redutor). */
  specificAttributes?: Record<string, string> | null;
}

export type AttachmentCategory = "LOCATION" | "INSTRUMENT" | "STANDARD" | "MEASUREMENT" | "DOCUMENT" | "OTHER";

/** Anexo generico - mesmo formato usado nos anexos de ativo, plano, OS de manutencao,
 * solicitacao e RCA (nome herdado de quando so calibracao tinha anexo). */
export interface CalibrationAttachment {
  id: string;
  category: AttachmentCategory;
  caption: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  client: ClientRef | null;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDefinitionDto {
  key: Role;
  label: string;
  description: string | null;
  permissions: string[];
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  description: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// CMMS - RLP Maintenance CMMS (gestao de manutencao, pacote opcional)
// ---------------------------------------------------------------------------

export type PredictiveTechnique =
  | "COUNTER"
  | "VIBRATION"
  | "THERMOGRAPHY"
  | "OIL_ANALYSIS"
  | "ULTRASOUND"
  | "MOTOR_CURRENT"
  | "VISUAL"
  | "OTHER";
export type MeasurementDirection = "UPPER" | "LOWER" | "RANGE";
export type ConditionSeverity = "NORMAL" | "WARNING" | "ALARM" | "CRITICAL";

export interface MeterReading {
  id: string;
  meterId: string;
  value: number;
  readAt: string;
  alertTriggered: boolean;
  severity: ConditionSeverity;
  notes: string | null;
  recordedById: string | null;
  createdAt: string;
}

export interface Meter {
  id: string;
  instrumentId: string;
  name: string;
  unit: string;
  currentValue: number;
  technique: PredictiveTechnique;
  direction: MeasurementDirection;
  minThreshold: number | null;
  maxThreshold: number | null;
  warningLimit: number | null;
  criticalLimit: number | null;
  criterion: string | null;
  frequencyDays: number | null;
  lastReadingAt: string | null;
  createdAt: string;
  readings?: MeterReading[];
}

/** Um ponto de medicao no painel preditivo, com tendencia recente. */
export interface PredictivePoint {
  id: string;
  name: string;
  unit: string;
  technique: PredictiveTechnique;
  direction: MeasurementDirection;
  criterion: string | null;
  frequencyDays: number | null;
  lastReadingAt: string | null;
  neverMeasured: boolean;
  collectionOverdue: boolean;
  dueInDays: number | null;
  severity: ConditionSeverity | null;
  lastValue: number | null;
  limits: { warning: number | null; alarm: number | null; critical: number | null };
  instrument: { id: string; tag: string | null; type: string; description: string | null; criticality: MaintenancePriority };
  trend: { value: number; readAt: string; severity: ConditionSeverity }[];
}

export interface PredictivePanelData {
  totals: {
    points: number;
    critical: number;
    alarm: number;
    warning: number;
    normal: number;
    neverMeasured: number;
    collectionOverdue: number;
  };
  needsAttention: PredictivePoint[];
  collectionOverdue: PredictivePoint[];
  points: PredictivePoint[];
}

export type AssetHierarchyLevel = "PLANT" | "AREA" | "MACHINE" | "SUBASSEMBLY" | "PART";

export type ServiceRequestStatus = "OPEN" | "IN_TRIAGE" | "AWAITING_INFO" | "PLANNED" | "CONVERTED" | "REJECTED" | "CLOSED";

export interface ServiceRequestCategory {
  id: string;
  clientId: string | null;
  name: string;
  active: boolean;
}

export interface ServiceRequest {
  id: string;
  number: string;
  clientId: string;
  client?: ClientRef;
  requestedById: string | null;
  requestedBy?: { id: string; name: string } | null;
  areaId: string | null;
  area?: { id: string; name: string } | null;
  instrumentId: string | null;
  instrument?: InstrumentRef | null;
  location: string | null;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  description: string;
  safetyImpact: boolean;
  qualityImpact: boolean;
  productionImpact: boolean;
  suggestedPriority: MaintenancePriority;
  status: ServiceRequestStatus;
  triageById: string | null;
  triageBy?: { id: string; name: string } | null;
  triageNotes: string | null;
  rejectionReason: string | null;
  workOrderId: string | null;
  workOrder?: { id: string; number: string; status: string } | null;
  createdAt: string;
}

export interface Plant {
  id: string;
  clientId: string;
  name: string;
  code: string | null;
  active: boolean;
}

export interface Area {
  id: string;
  clientId: string;
  plantId: string;
  plant?: { id: string; name: string };
  name: string;
  code: string | null;
  /** Centro de custo padrao: todo ativo dentro da area herda este centro de custo. */
  costCenterId?: string | null;
  costCenter?: { id: string; name: string; code?: string | null } | null;
  active: boolean;
}

export interface AssetSystem {
  id: string;
  clientId: string;
  areaId: string;
  area?: { id: string; name: string; plant?: { id: string; name: string } };
  name: string;
  code: string | null;
  active: boolean;
}

export interface CostCenter {
  id: string;
  clientId: string;
  name: string;
  code: string | null;
  active: boolean;
}

export interface AssetType {
  id: string;
  clientId: string | null;
  name: string;
  level: AssetHierarchyLevel | null;
  // Prefixo do codigo serializado (ex.: "MOT") - usado so' pelo cadastro de Equipamentos
  // recondicionaveis, pra sugerir o proximo codigo.
  codePrefix: string | null;
  active: boolean;
}

export interface FailureCode {
  id: string;
  clientId: string | null;
  code: string;
  description: string;
  category: string | null;
  symptom: string | null;
  mode: string | null;
  mechanism: string | null;
  cause: string | null;
  correctiveAction: string | null;
  applicableAssetFamily: string | null;
  severity: MaintenancePriority | null;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Equipamentos recondicionaveis (rotativos/reparaveis: motor, redutor, rolo...)
// ---------------------------------------------------------------------------

export type RotableEquipmentStatus = "IN_STOCK" | "INSTALLED" | "QUARANTINE" | "IN_RECONDITIONING" | "SCRAPPED";
export type RepairBudgetStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RotableRepairOutcome = "REPAIRED" | "PARTIALLY_REPAIRED" | "SCRAPPED";

export interface RotableEquipment {
  id: string;
  clientId: string;
  code: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  specificAttributes: Record<string, string> | null;
  status: RotableEquipmentStatus;
  currentInstrumentId: string | null;
  currentInstrument: { id: string; tag: string | null; description: string | null; type: string } | null;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  photoKey: string | null;
  photoFileName: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  installations?: RotableInstallation[];
  repairOrders?: RotableRepairOrder[];
}

export interface RotableInstallation {
  id: string;
  rotableId: string;
  instrumentId: string;
  instrument?: { id: string; tag: string | null; description: string | null };
  installedAt: string;
  meterReadingAtInstall: number | null;
  meterReadingAtRemoval: number | null;
  removedAt: string | null;
  installedById: string | null;
  removedById: string | null;
  removalReason: string | null;
  conditionAtRemoval: string | null;
  workOrderId: string | null;
  workOrder?: { id: string; number: string } | null;
  notes: string | null;
}

export interface RotableRepairOrder {
  id: string;
  rotableId: string;
  workOrderId: string | null;
  defectReported: string | null;
  diagnosis: string | null;
  failureCodeId: string | null;
  failureCode?: { id: string; code: string; description: string } | null;
  vendor: string | null;
  sentAt: string;
  budgetNumber: string | null;
  budgetValue: number | null;
  budgetStatus: RepairBudgetStatus;
  approvedById: string | null;
  approvedAt: string | null;
  promisedReturnAt: string | null;
  returnedAt: string | null;
  serviceDone: string | null;
  partsReplacedNotes: string | null;
  laborNotes: string | null;
  testsPerformed: string | null;
  finalReport: string | null;
  warrantyMonths: number | null;
  warrantyNotes: string | null;
  finalCost: number | null;
  conditionAfterRepair: string | null;
  outcome: RotableRepairOutcome | null;
  notes: string | null;
  createdAt: string;
}

export type MaintenanceTriggerType = "TIME" | "METER" | "CONDITION";
export type MaintenanceOrderType = "PREVENTIVE" | "CORRECTIVE" | "PREDICTIVE" | "LUBRICATION" | "INSPECTION" | "PROJECT";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MaintenanceOrderStatus =
  | "OPEN"
  | "IN_TRIAGE"
  | "PLANNED"
  | "PROGRAMMED"
  | "RELEASED"
  | "IN_PROGRESS"
  | "AWAITING_MATERIAL"
  | "AWAITING_RELEASE"
  | "AWAITING_STOPPAGE"
  | "COMPLETED"
  | "CANCELED";
export type ChecklistItemResult = "PENDING" | "OK" | "NOT_OK" | "NA";
export type DerivedDueStatus = "VALID" | "DUE_SOON" | "EXPIRED";

export type ChecklistResponseType = "YES_NO_NA" | "TEXT" | "NUMBER" | "PHOTO" | "SIGNATURE";

export interface MaintenancePlanChecklistItem {
  id?: string;
  description: string;
  /** Tempo esperado nesta operacao - somado, da a duracao estimada do servico. */
  estimatedMinutes?: number | null;
  sortOrder?: number;
  /** Agrupa itens em etapas ("Preparacao", "Execucao", "Encerramento"). */
  section?: string | null;
  required?: boolean;
  responseType?: ChecklistResponseType;
  unit?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  targetValue?: number | null;
  requiresPhoto?: boolean;
  reference?: string | null;
}

export interface MaintenancePlanPart {
  id?: string;
  sparePartId: string;
  sparePart?: { id: string; name: string; code: string | null; unit: string; stockQty: number; reservedQty: number };
  quantity: number;
  /** Falta de item obrigatorio e' o que aciona a politica de material do plano. */
  required?: boolean;
  alternativeSparePartId?: string | null;
  alternativeSparePart?: { id: string; name: string; code: string | null; unit: string; stockQty: number; reservedQty: number } | null;
  suggestedSupplier?: string | null;
  notes?: string | null;
}

export type MaintenancePlanStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
export type MaintenancePlanType =
  | "PREVENTIVE"
  | "PREDICTIVE"
  | "INSPECTION"
  | "LUBRICATION"
  | "CALIBRATION"
  | "ELECTRICAL"
  | "MECHANICAL"
  | "REGULATORY"
  | "OTHER";

/** Como o lubrificante e' aplicado no ponto. */
export type LubricationMethod = "MANUAL_GUN" | "AUTOMATIC_CENTRAL" | "OIL_BATH" | "IMMERSION" | "BRUSH" | "SPRAY";
export type MaintenancePlanScope = "SINGLE_ASSET" | "ASSET_FAMILY";
export type MaintenanceFrequencyUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type OperationalCalendar = "ALL_DAYS" | "BUSINESS_DAYS";
export type MeterResetRule = "CONTINUE" | "RESET_BASE";
export type MaintenanceTriggerMode = "FIRST_DUE" | "ALL_DUE";
export type MaterialPolicy = "RESERVE_AUTO" | "BLOCK_AWAITING_MATERIAL" | "ALERT_ONLY" | "DO_NOT_GENERATE";

export interface MaintenancePlan {
  id: string;
  clientId: string;
  /** Codigo legivel por cliente ("PM-0001"). */
  code: string | null;
  status: MaintenancePlanStatus;
  planType: MaintenancePlanType;
  scope: MaintenancePlanScope;
  /** Prioridade que a OS gerada por este plano recebe. */
  defaultPriority: MaintenancePriority;
  specialtyId: string | null;
  specialty?: { id: string; name: string } | null;
  // Agendamento
  frequencyUnit: MaintenanceFrequencyUnit;
  frequencyEvery: number | null;
  baseDate: string | null;
  lastExecutionAt: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  operationalCalendar: OperationalCalendar;
  blockedDates?: string[];
  generateAdvanceDays: number | null;
  meterBaseReading: number | null;
  generateAdvanceMeterUnits: number | null;
  toleranceMeterBefore: number | null;
  toleranceMeterAfter: number | null;
  meterResetRule: MeterResetRule;
  triggerMode: MaintenanceTriggerMode;
  conditionMeterId: string | null;
  // Como a OS gerada nasce
  initialWorkOrderStatus: MaintenanceOrderStatus;
  requiresShutdown: boolean;
  estimatedShutdownHours: number | null;
  requiresOperationalRelease: boolean;
  requiresLoto: boolean;
  requiresApproval: boolean;
  groupWorkOrder: boolean;
  materialPolicy: MaterialPolicy;
  /** Datas derivadas do agendamento, calculadas pelo backend a cada leitura. */
  schedule?: {
    nextGenerationDate: string | null;
    meterForecast: {
      dueAtReading: number | null;
      remaining: number | null;
      dailyAverage: number | null;
      forecastDate: string | null;
    } | null;
  };
  client?: ClientRef;
  /** Opcional: um plano pode nao ter ativo vinculado ainda. */
  instrumentId: string | null;
  instrument?: InstrumentRef | null;
  name: string;
  description: string | null;
  triggerType: MaintenanceTriggerType;
  frequencyDays: number | null;
  nextDueDate: string | null;
  meterId: string | null;
  meter?: { id: string; name: string; unit: string; currentValue: number } | null;
  meterInterval: number | null;
  lastGeneratedAt: string | null;
  lastMeterAtGeneration: number | null;
  active: boolean;
  responsibleId: string | null;
  responsible?: { id: string; name: string } | null;
  derivedStatus?: DerivedDueStatus;
  toleranceDaysBefore: number | null;
  toleranceDaysAfter: number | null;
  procedure: string | null;
  estimatedLaborHours: number | null;
  /** Procedimento/cuidados do plano - vira a descricao da OS gerada. */
  instructions?: string | null;
  /** Plano de lubrificacao agenda uma rota - o lubrificante, a quantidade e o metodo sao
   * a especificacao de cada ponto da rota, nao do plano. */
  lubricationRouteId?: string | null;
  lubricationRoute?: { id: string; name: string } | null;
  templateId: string | null;
  template?: { id: string; name: string } | null;
  checklistTemplate: MaintenancePlanChecklistItem[];
  parts?: MaintenancePlanPart[];
  workOrders?: { id: string; number: string; status: MaintenanceOrderStatus; completedAt: string | null }[];
  createdAt: string;
}

export interface MaintenancePlanTemplateChecklistItem {
  id?: string;
  description: string;
  sortOrder?: number;
}

export interface MaintenancePlanTemplate {
  id: string;
  clientId: string | null;
  name: string;
  applicableAssetFamily: string | null;
  triggerType: MaintenanceTriggerType;
  frequencyDays: number | null;
  meterInterval: number | null;
  toleranceDaysBefore: number | null;
  toleranceDaysAfter: number | null;
  procedure: string | null;
  estimatedLaborHours: number | null;
  active: boolean;
  createdAt: string;
  checklistItems: MaintenancePlanTemplateChecklistItem[];
}

export interface MaintenanceWorkOrderChecklistItem {
  id: string;
  workOrderId: string;
  description: string;
  /** Tempo esperado nesta operacao - somado, da a duracao estimada do servico. */
  estimatedMinutes?: number | null;
  result: ChecklistItemResult;
  notes: string | null;
  sortOrder: number;
  // Regra copiada do plano na geracao - o item executado guarda a propria regra, para o
  // historico nao mudar se o plano for editado depois.
  section: string | null;
  required: boolean;
  responseType: ChecklistResponseType;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  targetValue: number | null;
  requiresPhoto: boolean;
  reference: string | null;
  // O que o executante preencheu.
  numericValue: number | null;
  textValue: string | null;
  signedBy: string | null;
  signedAt: string | null;
}

export interface LaborType {
  id: string;
  clientId: string | null;
  name: string;
  active: boolean;
}

export interface LaborResource {
  /** Acesso desta pessoa no sistema - e' o que permite ela assumir uma OS sozinha. */
  userId?: string | null;
  user?: { id: string; name: string; email: string; role: Role } | null;
  id: string;
  clientId: string;
  client?: ClientRef;
  type: string;
  name: string;
  registrationNumber: string | null;
  hourlyRate: number | null;
  active: boolean;
  createdAt: string;
  /** Foto da pessoa - link temporario gerado pelo backend. */
  photoUrl?: string | null;
  photoFileName?: string | null;
}

export type LaborHourType = "NORMAL" | "OVERTIME" | "NIGHT";

export interface WorkOrderLaborEntry {
  id: string;
  workOrderId: string;
  laborResourceId: string;
  laborResource?: { id: string; name: string; type: string };
  hours: number;
  hourlyRateSnapshot: number | null;
  hourType: LaborHourType | null;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface WorkOrderThirdPartyService {
  id: string;
  workOrderId: string;
  supplierName: string;
  description: string;
  cost: number;
  invoiceNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export type SparePartReservationStatus = "RESERVED" | "CONSUMED" | "RELEASED";

export interface SparePartReservation {
  id: string;
  sparePartId: string;
  sparePart?: { id: string; name: string; code: string | null; unit: string };
  workOrderId: string;
  quantity: number;
  status: SparePartReservationStatus;
  createdAt: string;
}

export interface StoppageReason {
  id: string;
  clientId: string | null;
  name: string;
  active: boolean;
}

export interface WorkOrderStoppage {
  id: string;
  workOrderId: string;
  reasonId: string | null;
  reason?: { id: string; name: string } | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface InstrumentCostSummary {
  partsCost: number | null;
  laborCost: number | null;
  thirdPartyCost: number | null;
  totalCost: number | null;
  totalLaborHours: number;
}

export interface MaintenancePartUsed {
  id: string;
  sparePartId: string;
  sparePart?: { id: string; name: string; code: string | null; unit: string };
  quantity: number;
  unitCost: number | null;
  reason: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Almoxarifado (SparePart) - estoque tecnico interno do CMMS, separado do
// catalogo comercial de Produtos.
// ---------------------------------------------------------------------------

export interface SparePartMovement {
  id: string;
  sparePartId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  unitCost: number | null;
  reason: string | null;
  maintenanceWorkOrderId: string | null;
  createdAt: string;
}

export interface SparePart {
  id: string;
  clientId: string;
  client?: ClientRef;
  name: string;
  code: string | null;
  category: string | null;
  unit: string;
  stockQty: number;
  minStock: number;
  reservedQty: number;
  unitCost: number | null;
  active: boolean;
  createdAt: string;
  movements?: SparePartMovement[];
}

export interface AssetPart {
  id: string;
  instrumentId: string;
  sparePartId: string;
  sparePart?: SparePart;
  notes: string | null;
  createdAt: string;
}

/** Consumo real de pecas de um ativo (o que ja foi baixado do almoxarifado nas OS dele) -
 * diferente do AssetPart (BOM), que so lista o que e' compativel. */
export interface AssetPartHistoryEntry {
  sparePart: { id: string; name: string; code: string | null; unit: string };
  totalQuantity: number;
  timesUsed: number;
  totalCost: number | null;
  lastUsedAt: string;
  lastWorkOrder: { id: string; number: string } | null;
}

/** Corretiva com a maquina rodando ou corretiva de quebra (maquina parada). */
export type CorrectiveType = "IN_OPERATION" | "BREAKDOWN";

export type FailureSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

/** OS corretiva vista pelo angulo da falha (tela de Falhas/RCA). */
export interface FailureRecord {
  id: string;
  number: string;
  title: string | null;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceOrderStatus;
  failureStartedAt: string | null;
  failureEndedAt: string | null;
  failureSeverity: FailureSeverity | null;
  failureDescription: string | null;
  failureRootCause: string | null;
  failureCorrectiveAction: string | null;
  productionLoss: number | null;
  executionNotes: string | null;
  /** Calculado a partir da janela da falha - nao e' digitado. */
  downtimeHours: number | null;
  failureCode?: { id: string; code: string; description: string } | null;
  instrument?: { id: string; tag: string | null; description: string | null; type: string; area?: { id: string; name: string } | null } | null;
  client?: ClientRef;
  rootCauseAnalyses?: { id: string; status: string }[];
}

export interface MaintenanceWorkOrder {
  /** Em que momento a quebra chegou: ja aconteceu, esta acontecendo ou sera planejada. */
  breakdownSituation?: "ALREADY_HAPPENED" | "HAPPENING_NOW" | "TO_PLAN" | null;
  /** Como o servico sera executado - decidido na conversao da solicitacao. */
  executionCondition?: WorkOrderExecutionCondition | null;
  /** Precisa comprar material antes de executar (a OS nasce aguardando material). */
  needsPurchase?: boolean;
  purchaseNotes?: string | null;
  id: string;
  number: string;
  clientId: string;
  client?: ClientRef;
  instrumentId: string;
  instrument?: InstrumentRef;
  // Vinculo duplo: instrumentId/instrument acima e' o local funcional (onde o problema
  // ocorreu); rotableEquipmentId e' a unidade fisica (motor, redutor...) que apresentou a
  // falha, quando o ativo tem um equipamento recondicionavel instalado.
  rotableEquipmentId?: string | null;
  rotableEquipment?: { id: string; code: string; type: string; manufacturer: string | null; model: string | null; serialNumber: string | null; status: RotableEquipmentStatus } | null;
  planId: string | null;
  plan?: { id: string; name: string } | null;
  type: MaintenanceOrderType;
  priority: MaintenancePriority;
  status: MaintenanceOrderStatus;
  /** Titulo curto da OS - quando vazio, as telas caem na descricao. */
  title: string | null;
  description: string;
  /** Rateio contabil da OS (nasce do centro de custo do ativo). */
  costCenterId: string | null;
  costCenter?: { id: string; name: string; code?: string | null } | null;
  technicianId: string | null;
  technician?: { id: string; name: string } | null;
  /** Mao de obra do proprio cliente que vai executar (eixo do quadro de programacao). */
  assignedResourceId: string | null;
  assignedResource?: { id: string; name: string; type: string } | null;
  scheduledDate: string | null;
  /** Janela planejada do servico (planejado x realizado). */
  plannedStart: string | null;
  plannedEnd: string | null;
  estimatedHours: number | null;
  startedAt: string | null;
  completedAt: string | null;
  failureCodeId: string | null;
  failureCode?: FailureCode | null;
  // Preenchido quando a OS foi aberta sozinha por uma leitura de medidor fora da faixa.
  triggeredByMeterId: string | null;
  meterReadingAtExecution: number | null;
  laborHours: number | null;
  observations: string | null;
  /** O que foi executado, escrito por quem executou. */
  executionNotes: string | null;
  /** Registro do encerramento (pendencias, combinados, o que observar). */
  closureNotes: string | null;
  /** Em operacao ou de quebra - so na corretiva. */
  correctiveType: CorrectiveType | null;
  /** Registro de falha - preenchido pelo tecnico na OS corretiva. */
  failureStartedAt: string | null;
  failureEndedAt: string | null;
  failureSeverity: FailureSeverity | null;
  failureDescription: string | null;
  failureRootCause: string | null;
  failureCorrectiveAction: string | null;
  productionLoss: number | null;
  approvedById: string | null;
  approvedBy?: { id: string; name: string } | null;
  approvedAt: string | null;
  closedById: string | null;
  closedBy?: { id: string; name: string } | null;
  closedAt: string | null;
  checklist?: MaintenanceWorkOrderChecklistItem[];
  partsUsed?: MaintenancePartUsed[];
  laborEntries?: WorkOrderLaborEntry[];
  thirdPartyServices?: WorkOrderThirdPartyService[];
  partReservations?: SparePartReservation[];
  stoppages?: WorkOrderStoppage[];
  /** Material previsto da OS e o resumo previsto x reservado x consumido x falta. */
  materialLogs?: WorkOrderMaterialLog[];
  materialSummary?: WorkOrderMaterialSummary;
  /** RCAs abertas a partir da falha registrada nesta OS. */
  rootCauseAnalyses?: { id: string; status: string }[];
  // Rastreabilidade: de onde esta OS veio (SS que a originou, ou OS + item de checklist
  // que revelou a anomalia) e o que ela gerou (corretivas abertas automaticamente).
  serviceRequest?: { id: string; number: string; status: string } | null;
  originWorkOrderId: string | null;
  originWorkOrder?: { id: string; number: string; type: MaintenanceOrderType } | null;
  originChecklistItemId: string | null;
  originChecklistItem?: { id: string; description: string } | null;
  spawnedWorkOrders?: { id: string; number: string; status: MaintenanceOrderStatus; type: MaintenanceOrderType }[];
  // Equipe de apoio (o responsavel e' o assignedResource declarado acima).
  assignees?: WorkOrderAssignee[];
  createdAt: string;
}

export interface WorkOrderAssignee {
  id: string;
  workOrderId: string;
  laborResourceId: string;
  laborResource?: { id: string; name: string; type: string };
  createdAt: string;
}

/** Cartao enxuto de OS usado no quadro de programacao do PCM. */
export interface ScheduleCard {
  id: string;
  number: string;
  description: string;
  type: MaintenanceOrderType;
  priority: MaintenancePriority;
  status: MaintenanceOrderStatus;
  scheduledDate: string | null;
  laborHours: number | null;
  assignedResourceId: string | null;
  instrument?: { id: string; tag: string | null; type: string; area?: { id: string; name: string } | null } | null;
}

export interface MaintenanceScheduleData {
  clientId: string | null;
  /** photoUrl: link temporario da foto da pessoa, para a miniatura no quadro. */
  resources: { id: string; name: string; type: string; photoUrl?: string | null }[];
  scheduled: ScheduleCard[];
  unscheduled: ScheduleCard[];
}

export type RcaStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";

export interface RootCauseAnalysis {
  id: string;
  clientId: string;
  client?: ClientRef;
  instrumentId: string | null;
  instrument?: InstrumentRef | null;
  workOrderId: string | null;
  workOrder?: { id: string; number: string; status: string } | null;
  problem: string;
  participants: string | null;
  why1: string | null;
  why2: string | null;
  why3: string | null;
  why4: string | null;
  why5: string | null;
  rootCause: string | null;
  correctiveActions: string | null;
  preventiveActions: string | null;
  responsibleId: string | null;
  responsible?: { id: string; name: string } | null;
  dueDate: string | null;
  effectivenessVerifiedAt: string | null;
  effectivenessNotes: string | null;
  status: RcaStatus;
  createdAt: string;
}

export interface FailureAnalysisBucket {
  key: string;
  label: string;
  count: number;
  downtimeHours: number;
  cost: number;
}

export interface FailureAnalysisData {
  period: { from: string; to: string };
  totalCorrective: number;
  emergency: number;
  withoutFailureCode: number;
  recurringFailureCodes: number;
  byFailureCode: FailureAnalysisBucket[];
  byInstrument: FailureAnalysisBucket[];
  byArea: FailureAnalysisBucket[];
}

export interface MaintenanceDashboardData {
  period: { from: string; to: string };
  totals: {
    workOrders: number;
    open: number;
    inProgress: number;
    completed: number;
    corrective: number;
    preventive: number;
    predictive: number;
    other: number;
    predictiveAutoOpened: number;
    canceled: number;
  };
  costs: {
    total: number;
    preventive: number;
    corrective: number;
    predictive: number;
  };
  kpis: {
    /** null quando nao ha base de calculo - a tela mostra "sem dados", nunca zero. */
    mttrHours: number | null;
    mtbfHours: number | null;
    availabilityPct: number | null;
    planComplianceRatePct: number | null;
    mtbfByCriticality: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number | null>;
  };
  pcm: {
    backlogHours: number;
    openWithoutEstimate: number;
    overdue: number;
    emergency: number;
    awaitingMaterial: number;
    awaitingRelease: number;
    awaitingStoppage: number;
    plannedHoursCompleted: number;
    actualHoursCompleted: number;
    scheduleAdherencePct: number | null;
    scheduledCompletedCount: number;
    completedWithoutSchedule: number;
  };
  criticalLowStock: {
    id: string;
    name: string;
    code: string | null;
    stockQty: number;
    minStock: number;
    assets: { tag: string | null; criticality: string }[];
  }[];
}

// ── Lubrificacao ─────────────────────────────────────────────────────────────

export type LubricantType = "GREASE" | "OIL" | "OTHER";
export type LubricantBase = "MINERAL" | "SYNTHETIC" | "SEMI_SYNTHETIC";
export type MachineStateForLubrication = "STOPPED" | "RUNNING" | "ANY";
export type LubricationCondition = "NORMAL" | "LOW" | "DRY" | "CONTAMINATED" | "EXCESS";

/** Ficha tecnica sobre uma peca do almoxarifado - o saldo e o custo continuam sendo os
 * da peca, aqui so mora o que e' especifico de lubrificante. */
export interface Lubricant {
  id: string;
  clientId: string;
  sparePartId: string;
  sparePart: { id: string; name: string; code: string | null; unit: string; stockQty: number; minStock: number };
  type: LubricantType;
  specification: string | null;
  base: LubricantBase | null;
  manufacturer: string | null;
  application: string | null;
  notes: string | null;
  active: boolean;
  // O lubrificador tira a embalagem fechada do estoque (ex.: 1,8 kg) e usa aos poucos -
  // packageSize e' o conteudo da embalagem; openPackageRemaining e' quanto sobra da que
  // esta aberta agora (null = nenhuma embalagem aberta ou lubrificante nao rastreado por
  // embalagem). Null em packageSize = comportamento antigo, baixa direta por aplicacao.
  packageSize: number | null;
  openPackageRemaining: number | null;
  openPackageOpenedAt: string | null;
}

export interface LubricantInput {
  clientId?: string;
  sparePartId: string;
  type?: LubricantType;
  specification?: string | null;
  base?: LubricantBase | null;
  manufacturer?: string | null;
  application?: string | null;
  notes?: string | null;
  active?: boolean;
  packageSize?: number | null;
}

export interface LubricationPoint {
  id: string;
  clientId: string;
  instrumentId: string;
  instrument?: {
    id: string;
    tag: string | null;
    description: string | null;
    type: string;
    area?: { id: string; name: string } | null;
    plant?: { id: string; name: string } | null;
  };
  code: string;
  name: string;
  component: string | null;
  lubricantId: string;
  lubricant?: Lubricant;
  /** Na unidade da peca do almoxarifado - o ponto nao guarda unidade propria. */
  quantityPerApplication: number;
  method: LubricationMethod;
  frequencyDays: number;
  machineState: MachineStateForLubrication;
  accessNotes: string | null;
  safetyNotes: string | null;
  lastLubricatedAt: string | null;
  nextDueAt: string | null;
  active: boolean;
  routeItems?: { id: string; route: { id: string; name: string } }[];
  records?: LubricationRecord[];
}

export interface LubricationPointInput {
  clientId?: string;
  instrumentId: string;
  /** Em branco, o servidor numera a partir do TAG do ativo (-PT-01, -PT-02...). */
  code?: string;
  name: string;
  component?: string | null;
  lubricantId: string;
  quantityPerApplication: number;
  method: LubricationMethod;
  frequencyDays: number;
  machineState?: MachineStateForLubrication;
  accessNotes?: string | null;
  safetyNotes?: string | null;
  lastLubricatedAt?: string | null;
  active?: boolean;
}

export interface LubricationRecord {
  id: string;
  pointId: string;
  point?: { id: string; code: string; name: string; instrument?: { id: string; tag: string | null } };
  lubricantId: string;
  lubricant?: Lubricant;
  workOrderId: string | null;
  workOrder?: { id: string; number: string } | null;
  quantity: number;
  executedAt: string;
  laborResourceId: string | null;
  laborResource?: { id: string; name: string } | null;
  conditionBefore: LubricationCondition | null;
  conditionAfter: LubricationCondition | null;
  notes: string | null;
}

export interface LubricationRecordInput {
  quantity: number;
  lubricantId?: string;
  executedAt?: string;
  laborResourceId?: string | null;
  workOrderId?: string | null;
  conditionBefore?: LubricationCondition | null;
  conditionAfter?: LubricationCondition | null;
  notes?: string | null;
}

export interface LubricationRoute {
  id: string;
  clientId: string;
  name: string;
  code: string | null;
  plantId: string | null;
  plant?: { id: string; name: string } | null;
  areaId: string | null;
  area?: { id: string; name: string } | null;
  responsibleId: string | null;
  responsible?: { id: string; name: string; type: string } | null;
  notes: string | null;
  active: boolean;
  items?: { id: string; sortOrder: number; point: LubricationPoint }[];
}

export interface LubricationRouteInput {
  clientId?: string;
  name: string;
  code?: string | null;
  plantId?: string | null;
  areaId?: string | null;
  responsibleId?: string | null;
  notes?: string | null;
  active?: boolean;
  pointIds?: string[];
}

export interface LubricationDashboard {
  totais: { pontos: number; vencidos: number; proximos7Dias: number; rotas: number; aplicacoes30Dias: number; pendentesDeCadastro: number };
  /** null quando nao ha ponto cadastrado - nao se mostra 100% de aderencia sobre nada. */
  aderenciaPct: number | null;
  atrasados: LubricationPoint[];
}

export interface LubricationForecastItem {
  lubricantId: string;
  nome: string;
  codigo: string | null;
  unidade: string;
  especificacao: string | null;
  consumoPrevisto: number;
  aplicacoes: number;
  pontos: number;
  saldoAtual: number;
  estoqueMinimo: number;
  aComprar: number;
  diasDeCobertura: number | null;
  packageSize: number | null;
  embalagensACobrar: number | null;
}

export interface LubricationForecast {
  periodo: { de: string; ate: string; dias: number };
  itens: LubricationForecastItem[];
  detalhePorPonto: {
    pointId: string;
    code: string;
    name: string;
    instrumentTag: string | null;
    area: string | null;
    lubricante: string;
    aplicacoes: number;
    consumoPrevisto: number;
    unidade: string;
  }[];
  totais: { pontosConsiderados: number; lubrificantes: number; aplicacoesPrevistas: number; itensAComprar: number };
}

/** Como o backlog do PCM e' quebrado na tela. */
export type BacklogGroupBy = "plant" | "area" | "instrument" | "costCenter";

export interface MaintenanceBacklogItem {
  id: string;
  nome: string;
  ordens: number;
  horas: number;
  /** Quantas OS do grupo estao sem HH prevista - sem isso o total de horas engana. */
  semEstimativa: number;
  atrasadas: number;
  emergenciais: number;
  corretivas: number;
  preventivas: number;
}

export interface MaintenanceBacklog {
  groupBy: BacklogGroupBy;
  itens: MaintenanceBacklogItem[];
  totais: {
    ordens: number;
    horas: number;
    semEstimativa: number;
    /** Fracao da fila que entra na conta de horas; null quando nao ha OS aberta. */
    coberturaPct: number | null;
  };
}

// ── Material da OS e alertas do almoxarifado ─────────────────────────────────

/** Resumo da peca usado nas telas de material (saldo, reserva e minimo juntos). */
export interface SparePartResumo {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  stockQty: number;
  reservedQty: number;
  minStock: number;
  unitCost: number | null;
}

/** Material previsto de uma OS - o que ela precisa para ser executada. */
export interface WorkOrderMaterialLog {
  id: string;
  workOrderId: string;
  sparePartId: string;
  sparePart: SparePartResumo;
  quantityNeeded: number;
  reserved: boolean;
  reason: string | null;
  required: boolean;
  alternativeSparePartId: string | null;
  alternativeSparePart?: SparePartResumo | null;
  suggestedSupplier: string | null;
  createdAt: string;
}

export interface WorkOrderMaterialSummaryItem {
  sparePartId: string;
  nome: string;
  unidade: string;
  obrigatorio: boolean;
  previsto: number;
  reservado: number;
  consumido: number;
  saldoDisponivel: number;
  estoqueMinimo: number;
  abaixoDoMinimo: boolean;
  falta: number;
  custoPrevisto: number | null;
}

export interface WorkOrderMaterialSummary {
  itens: WorkOrderMaterialSummaryItem[];
  /** null quando alguma peca esta sem custo unitario - nao da para comparar pela metade. */
  custoPrevisto: number | null;
  custoRealizado: number;
  faltaObrigatorio: boolean;
  itensEmFalta: number;
}

export interface SparePartAlerts {
  abaixoDoMinimo: (SparePartResumo & { disponivel: number; faltaParaOMinimo: number })[];
  reservadoParaOsFutura: {
    reservationId: string;
    quantity: number;
    sparePart: { id: string; name: string; unit: string; stockQty: number; reservedQty: number };
    workOrder: { id: string; number: string; title: string | null; status: MaintenanceOrderStatus; scheduledDate: string | null };
  }[];
  osComMaterialFaltando: {
    id: string;
    number: string;
    title: string | null;
    status: MaintenanceOrderStatus;
    scheduledDate: string | null;
    faltando: { nome: string; unidade: string; previsto: number; falta: number }[];
  }[];
  totais: { abaixoDoMinimo: number; reservasFuturas: number; osComFalta: number; osAtrasadasComFalta: number };
}

export type EventoDeEstoque = "ENTRADA" | "SAIDA" | "AJUSTE" | "RESERVA" | "CONSUMO" | "DEVOLUCAO";

export interface SparePartHistory {
  sparePart: { id: string; name: string; unit: string };
  eventos: {
    tipo: EventoDeEstoque;
    quantidade: number;
    quando: string;
    usuario: string | null;
    workOrder: { id: string; number: string } | null;
    custoUnitario: number | null;
    observacao: string | null;
  }[];
}

/** Resultado de uma importacao por planilha (conferencia ou gravacao). */
/** O que fazer com um registro que a planilha traz e que ja esta cadastrado. */
export type ModoDeImportacao = "ignorar" | "completar";

/** Como a OS sera executada - decidido pelo planejador na conversao da solicitacao. */
export type WorkOrderExecutionCondition = "MACHINE_RUNNING" | "OPPORTUNITY_STOP" | "PLANNED_SHUTDOWN";

/** O que o planejador preenche ao transformar a solicitacao em OS. */
export interface ConversaoDaSolicitacao {
  title?: string;
  description?: string;
  type?: MaintenanceOrderType;
  correctiveType?: CorrectiveType | null;
  priority?: MaintenancePriority;
  executionCondition?: WorkOrderExecutionCondition | null;
  needsPurchase?: boolean;
  purchaseNotes?: string | null;
  scheduledDate?: string | null;
}

export interface ResultadoDaImportacao {
  simulacao: boolean;
  resumo: Record<string, { criados: number; ignorados: number; completados: number; comErro: number }>;
  problemas: { aba: string; linha: number; mensagem: string }[];
  ignorados: { aba: string; linha: number; motivo: string }[];
  /** Ja existiam e tiveram campos VAZIOS preenchidos (so no modo "completar"). */
  completados: { aba: string; linha: number; motivo: string }[];
}

// ---------------------------------------------------------------------------
// Cronograma de parada programada
// ---------------------------------------------------------------------------

export type ShutdownScheduleStatus = "PLANNING" | "IN_PROGRESS" | "DONE";

export interface ShutdownDateException {
  date: string;
  working: boolean;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shift24h?: boolean | null;
}

export interface ShutdownSchedule {
  id: string;
  clientId: string;
  name: string;
  status: ShutdownScheduleStatus;
  notes: string | null;
  /** 0=domingo...6=sabado - dias que contam como uteis pro reagendamento automatico. */
  workingWeekdays: number[];
  hoursPerDay: number;
  /** Horario padrao de expediente ("07:00"/"17:00") - sugerido em tarefa nova. */
  shiftStart: string | null;
  shiftEnd: string | null;
  shift24h: boolean;
  /** Dia especifico que foge do padrao semanal/horario (parada trabalhada num sabado,
   * feriado no meio da semana etc). */
  dateExceptions: ShutdownDateException[] | null;
  taskCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  tasks?: ShutdownTask[];
}

export interface ShutdownTask {
  id: string;
  parentTaskId: string | null;
  /** Tarefa que precisa terminar antes desta comecar (sequencia tipo MS Project). */
  predecessorTaskId: string | null;
  lagDays: number;
  name: string;
  instrumentId: string | null;
  instrument: { id: string; tag: string | null; description: string | null; type: string } | null;
  workOrderId: string | null;
  workOrder: {
    id: string;
    number: string;
    status: string;
    type: string;
    assignedResource?: { id: string; name: string } | null;
    technician?: { id: string; name: string } | null;
  } | null;
  startDate: string;
  endDate: string;
  percentComplete: number;
  resources: string | null;
  notes: string | null;
  sortOrder: number;
}
