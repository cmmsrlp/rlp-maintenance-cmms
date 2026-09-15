import { Suspense } from "react";
import { lazyPagina } from "./lib/lazyPagina";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { FullPageSpinner } from "./components/Spinner";
import { ScrollToTop } from "./components/ScrollToTop";
import { PublicLayout } from "./layouts/PublicLayout";

import Home from "./pages/public/Home";
import Lubrication from "./pages/public/Lubrication";
import AssetManagement from "./pages/public/AssetManagement";
import PredictiveMaintenance from "./pages/public/PredictiveMaintenance";
import TechnicalWarehouse from "./pages/public/TechnicalWarehouse";
import FailuresRca from "./pages/public/FailuresRca";
import RotableEquipmentPublic from "./pages/public/RotableEquipment";
import ClientPortal from "./pages/public/ClientPortal";
import Pricing from "./pages/public/Pricing";
import Login from "./pages/auth/Login";
import NotFound from "./pages/NotFound";

/** Redireciona um link antigo de "instrumentos/:id" (ex.: QR code ja impresso) para o
 * mesmo ativo em "/ativos/:id", preservando o id. */
function RedirectAtivoAntigo({ base }: { base: string }) {
  const { id } = useParams();
  return <Navigate to={`${base}/ativos/${id}`} replace />;
}

// Gestao interna e portal do cliente ficam fora do bundle inicial: so quem faz
// login (nunca um visitante anonimo) paga o custo de baixa-los.
const AdminLayout = lazyPagina(() => import("./layouts/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const ClientPortalLayout = lazyPagina(() =>
  import("./layouts/ClientPortalLayout").then((m) => ({ default: m.ClientPortalLayout })),
);

const Dashboard = lazyPagina(() => import("./pages/admin/Dashboard"));
const AdminProfile = lazyPagina(() => import("./pages/admin/Profile"));
const ClientsList = lazyPagina(() => import("./pages/admin/clients/ClientsList"));
const InsightsList = lazyPagina(() => import("./pages/admin/InsightsList"));
const ClientDetail = lazyPagina(() => import("./pages/admin/clients/ClientDetail"));
const InstrumentsList = lazyPagina(() => import("./pages/admin/instruments/InstrumentsList"));
const InstrumentDetail = lazyPagina(() => import("./pages/admin/instruments/InstrumentDetail"));
const AssetCriticalityList = lazyPagina(() => import("./pages/admin/instruments/AssetCriticalityList"));
const AssetCriticalityDetail = lazyPagina(() => import("./pages/admin/instruments/AssetCriticalityDetail"));
const InstrumentsTree = lazyPagina(() => import("./pages/admin/instruments/InstrumentsTree"));
const AssetTypesList = lazyPagina(() => import("./pages/admin/instruments/AssetTypesList"));
const TechnicalCatalogsHub = lazyPagina(() => import("./pages/admin/instruments/TechnicalCatalogsHub"));
const PlantsList = lazyPagina(() => import("./pages/admin/instruments/PlantsList"));
const AreasList = lazyPagina(() => import("./pages/admin/instruments/AreasList"));
const AssetSystemsList = lazyPagina(() => import("./pages/admin/instruments/AssetSystemsList"));
const UsersList = lazyPagina(() => import("./pages/admin/users/UsersList"));
const AuditLog = lazyPagina(() => import("./pages/admin/audit/AuditLog"));
const PlatformDashboard = lazyPagina(() => import("./pages/admin/platform/PlatformDashboard"));
const PlansList = lazyPagina(() => import("./pages/admin/platform/PlansList"));
const PlanosArte = lazyPagina(() => import("./pages/admin/platform/PlanosArte"));
const MaintenanceDashboard = lazyPagina(() => import("./pages/admin/maintenance/MaintenanceDashboard"));
const MaintenancePlansList = lazyPagina(() => import("./pages/admin/maintenance/MaintenancePlansList"));
const MaintenancePlanForm = lazyPagina(() => import("./pages/admin/maintenance/MaintenancePlanForm"));
const MaintenancePlanDetail = lazyPagina(() => import("./pages/admin/maintenance/MaintenancePlanDetail"));
const MaintenancePlanTemplatesList = lazyPagina(() => import("./pages/admin/maintenance/MaintenancePlanTemplatesList"));
const RotableEquipmentList = lazyPagina(() => import("./pages/admin/maintenance/RotableEquipmentList"));
const RotableEquipmentDetail = lazyPagina(() => import("./pages/admin/maintenance/RotableEquipmentDetail"));
const ShutdownSchedulesList = lazyPagina(() => import("./pages/admin/maintenance/ShutdownSchedulesList"));
const ShutdownScheduleDetail = lazyPagina(() => import("./pages/admin/maintenance/ShutdownScheduleDetail"));
const WorkOrdersList = lazyPagina(() => import("./pages/admin/maintenance/WorkOrdersList"));
const KanbanBoard = lazyPagina(() => import("./pages/admin/maintenance/KanbanBoard"));
const SchedulingBoard = lazyPagina(() => import("./pages/admin/maintenance/SchedulingBoard"));
const PlanningBoard = lazyPagina(() => import("./pages/admin/maintenance/PlanningBoard"));
const PredictivePanel = lazyPagina(() => import("./pages/admin/maintenance/PredictivePanel"));
const RcaList = lazyPagina(() => import("./pages/admin/maintenance/RcaList"));
const RcaForm = lazyPagina(() => import("./pages/admin/maintenance/RcaForm"));
const LubricationDashboard = lazyPagina(() => import("./pages/admin/lubrication/LubricationDashboard"));
const LubricationPointsList = lazyPagina(() => import("./pages/admin/lubrication/LubricationPointsList"));
const LubricationRoutesList = lazyPagina(() => import("./pages/admin/lubrication/LubricationRoutesList"));
const LubricantsList = lazyPagina(() => import("./pages/admin/lubrication/LubricantsList"));
const LubricationForecast = lazyPagina(() => import("./pages/admin/lubrication/LubricationForecast"));
const DataImport = lazyPagina(() => import("./pages/admin/imports/DataImport"));
const PortalContract = lazyPagina(() => import("./pages/portal/PortalContract"));
const PortalInsights = lazyPagina(() => import("./pages/portal/PortalInsights"));
const LubricationHistory = lazyPagina(() => import("./pages/admin/lubrication/LubricationHistory"));
const FailureAnalysis = lazyPagina(() => import("./pages/admin/maintenance/FailureAnalysis"));
const WorkOrderForm = lazyPagina(() => import("./pages/admin/maintenance/WorkOrderForm"));
const WorkOrderDetail = lazyPagina(() => import("./pages/admin/maintenance/WorkOrderDetail"));
const ServiceRequestsList = lazyPagina(() => import("./pages/admin/maintenance/ServiceRequestsList"));
const ServiceRequestForm = lazyPagina(() => import("./pages/admin/maintenance/ServiceRequestForm"));
const ServiceRequestDetail = lazyPagina(() => import("./pages/admin/maintenance/ServiceRequestDetail"));
const FailureCodesList = lazyPagina(() => import("./pages/admin/maintenance/FailureCodesList"));
const StoppageReasonsList = lazyPagina(() => import("./pages/admin/maintenance/StoppageReasonsList"));
const ServiceRequestCategoriesList = lazyPagina(() => import("./pages/admin/maintenance/ServiceRequestCategoriesList"));
const LaborTypesList = lazyPagina(() => import("./pages/admin/maintenance/LaborTypesList"));
const SparePartsList = lazyPagina(() => import("./pages/admin/maintenance/SparePartsList"));
const LaborResourcesList = lazyPagina(() => import("./pages/admin/maintenance/LaborResourcesList"));

const PortalDashboard = lazyPagina(() => import("./pages/portal/PortalDashboard"));
const PortalInstruments = lazyPagina(() => import("./pages/portal/PortalInstruments"));
const PortalInstrumentDetail = lazyPagina(() => import("./pages/portal/PortalInstrumentDetail"));
const PortalProfile = lazyPagina(() => import("./pages/portal/PortalProfile"));
const PortalSpareParts = lazyPagina(() => import("./pages/portal/PortalSpareParts"));
const PortalInstrumentsTree = lazyPagina(() => import("./pages/portal/PortalInstrumentsTree"));

export default function App() {
  return (
    <ToastProvider>
      <ScrollToTop />
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/lubrificacao" element={<Lubrication />} />
            <Route path="/gestao-de-ativos" element={<AssetManagement />} />
            <Route path="/manutencao-preditiva" element={<PredictiveMaintenance />} />
            <Route path="/almoxarifado-tecnico" element={<TechnicalWarehouse />} />
            <Route path="/falhas-e-causa-raiz" element={<FailuresRca />} />
            <Route path="/equipamentos-recondicionaveis" element={<RotableEquipmentPublic />} />
            <Route path="/portal-do-cliente" element={<ClientPortal />} />
            <Route path="/planos" element={<Pricing />} />
          </Route>
          <Route path="/entrar" element={<Login />} />

          <Route element={<ProtectedRoute roles={["ADMIN", "TECHNICIAN", "COMMERCIAL"]} />}>
            <Route path="/gestao" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="contrato" element={<PortalContract />} />
              <Route path="perfil" element={<AdminProfile />} />

              <Route path="clientes" element={<ClientsList />} />
              <Route path="clientes/:id" element={<ClientDetail />} />

              <Route path="ativos" element={<InstrumentsList />} />
              <Route path="ativos/tipos" element={<AssetTypesList />} />
              <Route path="ativos/cadastros" element={<TechnicalCatalogsHub />} />
              <Route path="ativos/plantas" element={<PlantsList />} />
              <Route path="ativos/areas" element={<AreasList />} />
              <Route path="ativos/sistemas" element={<AssetSystemsList />} />
              <Route path="ativos/criticidade" element={<AssetCriticalityList />} />
              <Route path="ativos/criticidade/:instrumentId" element={<AssetCriticalityDetail />} />
              <Route path="ativos/:id" element={<InstrumentDetail />} />
              {/* Compatibilidade com links/QR codes gerados antes do rename "instrumentos" -> "ativos". */}
              <Route path="instrumentos" element={<Navigate to="/gestao/ativos" replace />} />
              <Route path="instrumentos/:id" element={<RedirectAtivoAntigo base="/gestao" />} />
              <Route path="manutencao/arvore" element={<InstrumentsTree />} />

              <Route path="manutencao" element={<MaintenanceDashboard />} />
              <Route path="manutencao/planos" element={<MaintenancePlansList />} />
              <Route path="manutencao/planos/novo" element={<MaintenancePlanForm />} />
              <Route path="manutencao/planos/:id/editar" element={<MaintenancePlanForm />} />
              <Route path="manutencao/planos/:id" element={<MaintenancePlanDetail />} />
              <Route path="manutencao/modelos-de-plano" element={<MaintenancePlanTemplatesList />} />
              <Route path="manutencao/equipamentos-recondicionaveis" element={<RotableEquipmentList />} />
              <Route path="manutencao/equipamentos-recondicionaveis/:id" element={<RotableEquipmentDetail />} />
              <Route path="manutencao/cronogramas-parada" element={<ShutdownSchedulesList />} />
              <Route path="manutencao/cronogramas-parada/:id" element={<ShutdownScheduleDetail />} />
              <Route path="manutencao/ordens" element={<WorkOrdersList />} />
              <Route path="manutencao/kanban" element={<KanbanBoard />} />
              <Route path="manutencao/programacao" element={<SchedulingBoard />} />
              <Route path="manutencao/planejamento" element={<PlanningBoard />} />
              <Route path="manutencao/preditiva" element={<PredictivePanel />} />
              <Route path="manutencao/ordens/novo" element={<WorkOrderForm />} />
              <Route path="manutencao/ordens/:id/editar" element={<WorkOrderForm />} />
              <Route path="manutencao/ordens/:id" element={<WorkOrderDetail />} />
              <Route path="manutencao/solicitacoes" element={<ServiceRequestsList />} />
              <Route path="manutencao/solicitacoes/novo" element={<ServiceRequestForm />} />
              <Route path="manutencao/solicitacoes/:id/editar" element={<ServiceRequestForm />} />
              <Route path="manutencao/solicitacoes/:id" element={<ServiceRequestDetail />} />
              <Route path="manutencao/categorias-solicitacao" element={<ServiceRequestCategoriesList />} />
              <Route path="manutencao/falhas" element={<FailureCodesList />} />
              <Route path="manutencao/pareto" element={<FailureAnalysis />} />
              <Route path="manutencao/rca" element={<RcaList />} />
              <Route path="manutencao/rca/novo" element={<RcaForm />} />
              <Route path="manutencao/rca/:id" element={<RcaForm />} />
              <Route path="manutencao/paradas" element={<StoppageReasonsList />} />
              <Route path="lubrificacao" element={<LubricationDashboard />} />
              <Route path="lubrificacao/pontos" element={<LubricationPointsList />} />
              <Route path="lubrificacao/rotas" element={<LubricationRoutesList />} />
              <Route path="lubrificacao/lubrificantes" element={<LubricantsList />} />
              <Route path="lubrificacao/previsao" element={<LubricationForecast />} />
              <Route path="lubrificacao/historico" element={<LubricationHistory />} />
              <Route path="manutencao/importar" element={<DataImport />} />
              <Route path="manutencao/almoxarifado" element={<SparePartsList />} />
              <Route path="manutencao/mao-de-obra" element={<LaborResourcesList />} />
              <Route path="manutencao/tipos-mao-de-obra" element={<LaborTypesList />} />

              <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                <Route path="insights" element={<InsightsList />} />
                <Route path="usuarios" element={<UsersList />} />
                <Route path="auditoria" element={<AuditLog />} />
                <Route path="plataforma" element={<PlatformDashboard />} />
                <Route path="plataforma/planos" element={<PlansList />} />
                <Route path="plataforma/planos/arte" element={<PlanosArte />} />
              </Route>
            </Route>
          </Route>

          {/* Todo o portal e' da equipe do cliente. Os blocos aninhados abaixo separam o
              que cada perfil alcanca - a mesma regra que a API cobra em cada rota, porque
              esconder o item do menu nunca foi permissao: quem sabe a URL entra assim mesmo. */}
          <Route element={<ProtectedRoute roles={["CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN", "REQUESTER"]} />}>
            <Route path="/portal" element={<ClientPortalLayout />}>
              {/* Solicitante: so as proprias solicitacoes e o proprio perfil. */}
              <Route path="manutencao/solicitacoes" element={<ServiceRequestsList />} />
              <Route path="manutencao/solicitacoes/novo" element={<ServiceRequestForm />} />
              <Route path="manutencao/solicitacoes/:id/editar" element={<ServiceRequestForm />} />
              <Route path="manutencao/solicitacoes/:id" element={<ServiceRequestDetail />} />
              <Route path="perfil" element={<PortalProfile />} />

              {/* Equipe de manutencao: consulta o parque e trabalha nas ordens. */}
              <Route element={<ProtectedRoute roles={["CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN"]} />}>
                <Route index element={<PortalDashboard />} />
                {/* A arvore e' a entrada padrao ao clicar em "Meus ativos" no menu - a lista
                    (antes a entrada padrao) fica um clique adiante, em /ativos/lista. */}
                <Route path="ativos" element={<PortalInstrumentsTree />} />
                <Route path="ativos/lista" element={<PortalInstruments />} />
                <Route path="ativos/:id" element={<PortalInstrumentDetail />} />
                {/* Compatibilidade com links/QR codes gerados antes do rename "instrumentos" -> "ativos". */}
                <Route path="instrumentos" element={<Navigate to="/portal/ativos" replace />} />
                <Route path="instrumentos/:id" element={<RedirectAtivoAntigo base="/portal" />} />
                {/* "Meus ativos" ja abre na arvore agora - mantido so' para links antigos. */}
                <Route path="manutencao/arvore" element={<Navigate to="/portal/ativos" replace />} />
                <Route path="manutencao" element={<MaintenanceDashboard />} />
                <Route path="manutencao/ordens" element={<WorkOrdersList />} />
                <Route path="manutencao/ordens/:id" element={<WorkOrderDetail />} />
                <Route path="manutencao/kanban" element={<KanbanBoard />} />
                <Route path="almoxarifado" element={<PortalSpareParts />} />
                <Route path="lubrificacao" element={<LubricationDashboard />} />
                <Route path="lubrificacao/pontos" element={<LubricationPointsList />} />
                <Route path="lubrificacao/rotas" element={<LubricationRoutesList />} />
                <Route path="lubrificacao/historico" element={<LubricationHistory />} />
              </Route>

              {/* Planejamento: monta plano, programa, aprova e olha custo. O Tecnico
                  executa o que foi programado, entao nao reestrutura nada disto. */}
              <Route element={<ProtectedRoute roles={["CLIENT", "CLIENT_PLANNER"]} />}>
                <Route path="insights" element={<PortalInsights />} />
                <Route path="auditoria" element={<AuditLog own />} />
                <Route path="ativos/cadastros" element={<TechnicalCatalogsHub />} />
                <Route path="ativos/tipos" element={<AssetTypesList />} />
                <Route path="ativos/plantas" element={<PlantsList />} />
                <Route path="ativos/areas" element={<AreasList />} />
                <Route path="ativos/sistemas" element={<AssetSystemsList />} />
                <Route path="ativos/criticidade" element={<AssetCriticalityList />} />
                <Route path="ativos/criticidade/:instrumentId" element={<AssetCriticalityDetail />} />
                <Route path="manutencao/planos" element={<MaintenancePlansList />} />
                <Route path="manutencao/planos/novo" element={<MaintenancePlanForm />} />
                <Route path="manutencao/planos/:id/editar" element={<MaintenancePlanForm />} />
                <Route path="manutencao/planos/:id" element={<MaintenancePlanDetail />} />
                <Route path="manutencao/modelos-de-plano" element={<MaintenancePlanTemplatesList />} />
                <Route path="manutencao/equipamentos-recondicionaveis" element={<RotableEquipmentList />} />
                <Route path="manutencao/equipamentos-recondicionaveis/:id" element={<RotableEquipmentDetail />} />
                <Route path="manutencao/cronogramas-parada" element={<ShutdownSchedulesList />} />
                <Route path="manutencao/cronogramas-parada/:id" element={<ShutdownScheduleDetail />} />
                <Route path="manutencao/ordens/novo" element={<WorkOrderForm />} />
                <Route path="manutencao/ordens/:id/editar" element={<WorkOrderForm />} />
                <Route path="manutencao/programacao" element={<SchedulingBoard />} />
                <Route path="manutencao/planejamento" element={<PlanningBoard />} />
                <Route path="manutencao/preditiva" element={<PredictivePanel />} />
                <Route path="manutencao/categorias-solicitacao" element={<ServiceRequestCategoriesList />} />
                <Route path="manutencao/falhas" element={<FailureCodesList />} />
                <Route path="manutencao/pareto" element={<FailureAnalysis />} />
                <Route path="manutencao/rca" element={<RcaList />} />
                <Route path="manutencao/rca/novo" element={<RcaForm />} />
                <Route path="manutencao/rca/:id" element={<RcaForm />} />
                <Route path="manutencao/paradas" element={<StoppageReasonsList />} />
                <Route path="manutencao/mao-de-obra" element={<LaborResourcesList />} />
                <Route path="manutencao/tipos-mao-de-obra" element={<LaborTypesList />} />
                <Route path="lubrificacao/lubrificantes" element={<LubricantsList />} />
                <Route path="lubrificacao/previsao" element={<LubricationForecast />} />
              </Route>

              {/* Contrato e importacao mexem na empresa inteira: so o Administrador. */}
              <Route element={<ProtectedRoute roles={["CLIENT"]} />}>
                <Route path="contrato" element={<PortalContract />} />
                <Route path="manutencao/importar" element={<DataImport />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
