import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { sendGmail } from "@/functions/sendGmail";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Bug,
  Lightbulb,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  Play,
  Edit,
  ChevronRight
} from "lucide-react";

const FeatureReport = base44.entities.FeatureReport;

const TYPE_CONFIG = {
  bug: { label: "Bug", icon: Bug, color: "bg-red-100 text-red-700", borderColor: "border-red-300" },
  feature: { label: "Feature Request", icon: Lightbulb, color: "bg-blue-100 text-blue-700", borderColor: "border-blue-300" },
  improvement: { label: "Improvement", icon: TrendingUp, color: "bg-green-100 text-green-700", borderColor: "border-green-300" }
};

const PRIORITY_CONFIG = {
  low: { label: "Low", color: "bg-gray-100 text-gray-600" },
  medium: { label: "Medium", color: "bg-yellow-100 text-yellow-700" },
  high: { label: "High", color: "bg-orange-100 text-orange-700" },
  critical: { label: "Critical", color: "bg-red-100 text-red-700" }
};

const STATUS_CONFIG = {
  open: { label: "Open", icon: AlertCircle, color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", icon: Clock, color: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-700" }
};

export default function FeatureReports() {
  const { currentUser, isRegistered } = useAuth();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "feature",
    priority: "medium"
  });

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setIsLoading(true);
    const allReports = await FeatureReport.filter({ status: { $ne: "completed" } }, "-created_date");
    setReports(allReports);
    setIsLoading(false);
  };

  const openNewReport = () => {
    setEditingReport(null);
    setFormData({
      title: "",
      description: "",
      type: "feature",
      priority: "medium"
    });
    setIsDialogOpen(true);
  };

  const openEditReport = (report) => {
    setEditingReport(report);
    setFormData({
      title: report.title,
      description: report.description || "",
      type: report.type,
      priority: report.priority || "medium",
      admin_notes: report.admin_notes || ""
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) return;
    
    setIsSubmitting(true);

    if (editingReport) {
      await FeatureReport.update(editingReport.id, formData);
    } else {
      const newReport = await FeatureReport.create({
        ...formData,
        submitted_by_name: currentUser?.full_name || "Unknown",
        submitted_by_email: currentUser?.email || "unknown"
      });

      // Send email notification
      try {
        const typeLabel = TYPE_CONFIG[formData.type]?.label || formData.type;
        await sendGmail({
          to: "brett@Cincisigns.com",
          subject: `New ${typeLabel}: ${formData.title}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #7C3AED;">New ${typeLabel} Submitted</h2>
              <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <p><strong>Title:</strong> ${formData.title}</p>
                <p><strong>Type:</strong> ${typeLabel}</p>
                <p><strong>Priority:</strong> ${formData.priority}</p>
                <p><strong>Submitted by:</strong> ${currentUser?.full_name || "Unknown"} (${currentUser?.email || "unknown"})</p>
                ${formData.description ? `<p><strong>Description:</strong></p><p>${formData.description}</p>` : ''}
              </div>
              <p style="color: #666;">View and manage this report in the Sign Shop Workflow app.</p>
            </div>
          `
        });
      } catch (e) {
        console.error("Failed to send notification email:", e);
      }
    }

    setIsDialogOpen(false);
    setIsSubmitting(false);
    loadReports();
  };

  const handleStatusChange = async (report, newStatus) => {
    const updateData = { status: newStatus };
    if (newStatus === "completed") {
      updateData.completed_date = new Date().toISOString();
    }
    await FeatureReport.update(report.id, updateData);
    loadReports();
  };

  const handleDelete = async (id) => {
    await FeatureReport.delete(id);
    setDeleteConfirm(null);
    loadReports();
  };

  const filteredReports = filterType === "all" 
    ? reports 
    : reports.filter(r => r.type === filterType);

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-6 sm:pt-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3 flex-shrink-0">
              <Lightbulb className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Feature & Bug Reports</h1>
              <p className="text-gray-600 text-sm">Submit ideas and report issues</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Link to={createPageUrl("CompletedReports")}>
              <Button variant="outline" className="gap-1 sm:gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span className="hidden sm:inline">Completed</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
            {isRegistered && (
              <Button
                onClick={openNewReport}
                className="clay-button border-none text-gray-800 text-sm"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">New Report</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
          >
            All
          </Button>
          {Object.entries(TYPE_CONFIG).map(([key, config]) => (
            <Button
              key={key}
              variant={filterType === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(key)}
              className="gap-1"
            >
              <config.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{config.label}</span>
            </Button>
          ))}
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="clay-card p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="clay-card p-12 text-center">
            <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Reports Yet</h3>
            <p className="text-gray-500">Be the first to submit a feature request or bug report!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReports.map((report) => {
              const typeConfig = TYPE_CONFIG[report.type] || TYPE_CONFIG.feature;
              const priorityConfig = PRIORITY_CONFIG[report.priority] || PRIORITY_CONFIG.medium;
              const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
              const TypeIcon = typeConfig.icon;
              const StatusIcon = statusConfig.icon;

              return (
                <div
                  key={report.id}
                  className={`clay-card p-4 border-l-4 ${typeConfig.borderColor}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <TypeIcon className="w-4 h-4 text-gray-600" />
                        <h4 className="font-medium text-gray-800">{report.title}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                        <Badge className={priorityConfig.color}>{priorityConfig.label}</Badge>
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </div>
                      {report.description && (
                        <p className="text-sm text-gray-600 mt-2">{report.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Submitted by {report.submitted_by_name} • {new Date(report.created_date).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {isAdmin && report.status === "open" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(report, "in_progress")}
                          className="h-8 w-8"
                          title="Start working"
                        >
                          <Play className="w-4 h-4 text-blue-600" />
                        </Button>
                      )}
                      {isAdmin && report.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(report, "completed")}
                          className="h-8 w-8"
                          title="Mark complete"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditReport(report)}
                          className="h-8 w-8"
                        >
                          <Edit className="w-4 h-4 text-gray-600" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(report)}
                          className="h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (open) setIsDialogOpen(true); }}>
          <DialogContent className="clay-card border-none">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingReport ? "Edit Report" : "Submit New Report"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Brief summary of your report"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val) => setFormData({ ...formData, type: val })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">
                        <div className="flex items-center gap-2">
                          <Bug className="w-4 h-4" /> Bug
                        </div>
                      </SelectItem>
                      <SelectItem value="feature">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4" /> Feature Request
                        </div>
                      </SelectItem>
                      <SelectItem value="improvement">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" /> Improvement
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(val) => setFormData({ ...formData, priority: val })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Provide more details..."
                  className="mt-1 min-h-24"
                />
              </div>

              {isAdmin && editingReport && (
                <div>
                  <Label>Admin Notes</Label>
                  <Textarea
                    value={formData.admin_notes || ""}
                    onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
                    placeholder="Internal notes..."
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!formData.title.trim() || isSubmitting}
                  className="clay-button border-none"
                  style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingReport ? (
                    "Save Changes"
                  ) : (
                    "Submit Report"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (open) setDeleteConfirm(deleteConfirm); }}>
          <AlertDialogContent className="clay-card border-none">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Report?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteConfirm?.title}"? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete(deleteConfirm?.id)}
                className="bg-red-600 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}