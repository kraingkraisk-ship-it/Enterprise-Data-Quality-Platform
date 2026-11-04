// View registry — the page integrator resolves a ViewKey to its component here.
// Direct (non-lazy) imports: the whole app is client-side and small.
// Merged: 2-b (dashboards+login), 2-c (data views), 2-d (rules+validation), 2-e (governance).
import { createElement } from 'react'
import type { ComponentType } from 'react'
import type { ViewKey } from '@/lib/types'
import type { ViewCtx } from './ctx'
import DashboardExecutiveView from './dashboard-executive'
import DashboardOperationalView from './dashboard-operational'
import DashboardEngineeringView from './dashboard-engineering'
import DashboardMlView from './dashboard-ml'
import DashboardAuditView from './dashboard-audit'
import LoginView from './login'
import DataSourcesView from './data-sources'
import CatalogueView from './catalogue'
import DatasetDetail from './dataset-detail'
import ProfilingView from './profiling'
import RulesView from './rules'
import RuleBuilderView from './rule-builder'
import ValidationsView from './validations'
import ValidationDetailView from './validation-detail'
import AnomaliesView from './anomalies'
import IssuesView from './issues'
import MlModelsView from './ml-models'
import ReportsView from './reports'
import AuditLogsView from './audit-logs'
import AdministrationView from './administration'

// Login is pre-auth (no ViewCtx). Without an explicit onLogin callback the
// view stores the user itself and dispatches 'edqp:navigate' to the role's
// default home view — see login.tsx.
function LoginRoute() {
  return createElement(LoginView)
}

export const VIEW_COMPONENTS: Partial<Record<ViewKey, ComponentType<{ ctx: ViewCtx }>>> = {
  'dashboard-executive': DashboardExecutiveView,
  'dashboard-operational': DashboardOperationalView,
  'dashboard-engineering': DashboardEngineeringView,
  'dashboard-ml': DashboardMlView,
  'dashboard-audit': DashboardAuditView,
  login: LoginRoute,
  'data-sources': DataSourcesView,
  'catalogue': CatalogueView,
  'dataset-detail': DatasetDetail,
  'profiling': ProfilingView,
  'rules': RulesView,
  'rule-builder': RuleBuilderView,
  'validations': ValidationsView,
  'validation-detail': ValidationDetailView,
  'anomalies': AnomaliesView,
  'issues': IssuesView,
  'ml-models': MlModelsView,
  'reports': ReportsView,
  'audit-logs': AuditLogsView,
  'administration': AdministrationView,
}
