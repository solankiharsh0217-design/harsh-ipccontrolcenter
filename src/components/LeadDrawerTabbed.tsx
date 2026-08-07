import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { GRADE_STYLES, type Lead, type Stage, type ActivityLog, type Reminder } from "@/lib/crmTypes";
import { X, Phone, MessageCircle, Mail, MessageSquare, Trash2, ExternalLink, Sparkles, ChevronDown, Archive, RotateCcw, Plus, CreditCard, Pencil, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ... (keep imports)

import TagPicker from "@/components/TagPicker";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { createNotification } from "@/lib/notifications";
import SendToOperationsCrmModal from "@/components/SendToOperationsCrmModal";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, type HandoffRule } from "@/lib/operationsCrm";
import { archiveLead, restoreLead, permanentlyDeleteLead, getLeadLinks } from "@/lib/crmArchive";
import { ArchiveConfirmModal, PermanentDeleteModal } from "@/components/crm/ArchiveConfirmModal";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import { recomputePaidLead } from "@/lib/paidPipeline";
import { logActivity as auditLog } from "@/lib/auditLog";
import { stageChip } from "@/lib/stageColors";
import CrmStagePicker from "@/components/crm/CrmStagePicker";
import CodeOfConductCard from "@/components/crm/CodeOfConductCard";
import ConvertToPaidModal from "@/components/crm/ConvertToPaidModal";
import ConversionHistoryDrawer from "@/components/crm/ConversionHistoryDrawer";
import { loadActiveConversionRules, isConvertedStage, DEFAULT_TRIGGER_STAGES, type ConversionRule } from "@/lib/conversionRules";
import SessionAttendanceTimeline from "@/components/crm/SessionAttendanceTimeline";
import LinkedRecordsPanel from "@/components/crm/LinkedRecordsPanel";
import AccessVerificationPanel from "@/components/access-followup/AccessVerificationPanel";
import LeadNotesSection from "@/components/crm/LeadNotesSection";
import MoveCopyLinkPipelineModal from "@/components/crm/MoveCopyLinkPipelineModal";
import SendToPaidOnboardingModal from "@/components/crm/SendToPaidOnboardingModal";
import PromisedOffersPanel from "@/components/offers/PromisedOffersPanel";
import ServicePackageChip from "@/components/ServicePackageChip";
import { inr } from "@/lib/format";

// ... (rest of implementation)
