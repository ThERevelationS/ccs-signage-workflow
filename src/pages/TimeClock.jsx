import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Clock, 
  Play, 
  Square, 
  Calendar, 
  History, 
  User,
  Coffee,
  Briefcase,
  Home,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  Save,
  X,
  LogIn,
  LogOut,
  Lock,
  Settings
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO } from "date-fns";
import ClockOutDialog from "@/components/timeclock/ClockOutDialog";
import TimeOffRequestDialog from "@/components/timeclock/TimeOffRequestDialog";
import PTOBalanceView from "@/components/timeclock/PTOBalanceView";
import QuickClockSection from "@/components/timeclock/QuickClockSection";
import TimeClockLoginDialog from "@/components/timeclock/TimeClockLoginDialog";
import UserSettingsTab from "@/components/timeclock/UserSettingsTab";

const TimeEntry = base44.entities.TimeEntry;
const TimeOffRequest = base44.entities.TimeOffRequest;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function TimeClock() {
  const { currentUser: authUser, isRegistered } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  
  const [activeEntry, setActiveEntry] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showClockOut, setShowClockOut] = useState(false);
  const [showTimeOffRequest, setShowTimeOffRequest] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [activeTab, setActiveTab] = useState("clock");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [editingNotes, setEditingNotes] = useState(null);
  const [editNotesText, setEditNotesText] = useState("");
  const [editingTimeOff, setEditingTimeOff] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (loggedInUser?.email) {
      loadData();
    }
  }, [loggedInUser]);

  const loadAllUsers = async () => {
    setIsLoading(true);
    try {
      const users = await AuthorizedEmail.list();
      setAllUsers(users);
    } catch (err) {
      console.error("Error loading users:", err);
    }
    setIsLoading(false);
  };

  const loadData = async () => {
    if (!loggedInUser?.email) return;
    
    setIsLoading(true);
    try {
      const [entries, requests] = await Promise.all([
        TimeEntry.filter({ user_email: loggedInUser.email }),
        TimeOffRequest.filter({ user_email: loggedInUser.email })
      ]);
      
      entries.sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in));
      requests.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      
      setTimeEntries(entries);
      setTimeOffRequests(requests);
      
      const active = entries.find(e => e.status === "clocked_in");
      setActiveEntry(active || null);
    } catch (err) {
      console.error("Error loading data:", err);
    }
    setIsLoading(false);
  };

  const handleLogin = (user) => {
    setLoggedInUser(user);
    setShowLoginDialog(false);
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setTimeEntries([]);
    setTimeOffRequests([]);
    setActiveEntry(null);
  };

  const handleClockIn = async () => {
    try {
      const entry = await TimeEntry.create({
        user_email: loggedInUser.email,
        user_name: loggedInUser.full_name || loggedInUser.email,
        clock_in: new Date().toISOString(),
        status: "clocked_in"
      });
      setActiveEntry(entry);
      loadData();
    } catch (err) {
      console.error("Clock in error:", err);
    }
  };

  const handleClockOut = async (data) => {
    try {
      await TimeEntry.update(activeEntry.id, {
        clock_out: data.clockOutTime,
        lunch_minutes: data.lunchMinutes,
        total_hours: data.totalHours,
        job_allocations: data.jobAllocations,
        notes: data.notes,
        status: "clocked_out"
      });
      setActiveEntry(null);
      setShowClockOut(false);
      loadData();
    } catch (err) {
      console.error("Clock out error:", err);
    }
  };

  // Calculate weekly hours
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });

  const weeklyEntries = timeEntries.filter(entry => {
    const entryDate = parseISO(entry.clock_in);
    return isWithinInterval(entryDate, { start: weekStart, end: weekEnd });
  });

  const weeklyHours = weeklyEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);

  // Calculate overtime (OH law: OT only for hours WORKED over 40, PTO doesn't count)
  const regularHours = Math.min(weeklyHours, 40);
  const overtimeHours = Math.max(0, weeklyHours - 40);

  // Calculate elapsed time for active entry
  const getElapsedTime = () => {
    if (!activeEntry) return null;
    const start = new Date(activeEntry.clock_in);
    const diff = currentTime - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { hours, minutes, seconds, formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` };
  };

  const elapsed = getElapsedTime();

  const handleSaveNotes = async (entryId) => {
    try {
      await TimeEntry.update(entryId, { notes: editNotesText });
      setEditingNotes(null);
      setEditNotesText("");
      loadData();
    } catch (err) {
      console.error("Error saving notes:", err);
    }
  };

  const startEditingNotes = (entry) => {
    setEditingNotes(entry.id);
    setEditNotesText(entry.notes || "");
  };

  if (isLoading && allUsers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Time Clock</h1>
              <p className="text-gray-600 text-sm">Track your work hours</p>
            </div>
          </div>
          
          {loggedInUser ? (
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowTimeOffRequest(true)} variant="outline" className="gap-2">
                <Calendar className="w-4 h-4" />
                Request Time Off
              </Button>
              <Button onClick={handleLogout} variant="outline" className="gap-2">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          ) : (
            <Button onClick={() => setShowLoginDialog(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <LogIn className="w-4 h-4" />
              Login for Full Access
            </Button>
          )}
        </div>

        {/* Current Time Display */}
        <div className="clay-card p-6 mb-6 text-center">
          <p className="text-sm text-gray-500 mb-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
          <p className="text-4xl font-bold text-gray-800">{format(currentTime, "h:mm:ss a")}</p>
        </div>

        {/* Quick Clock In/Out Section - Always Visible */}
        <QuickClockSection allUsers={allUsers} currentTime={currentTime} />

        {/* Login Required Section */}
        {!loggedInUser ? (
          <div className="clay-card p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">Login Required</h3>
            <p className="text-gray-500 mb-4">
              Login to view your time history, time off requests, and PTO balance
            </p>
            <Button onClick={() => setShowLoginDialog(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <LogIn className="w-4 h-4" />
              Login
            </Button>
          </div>
        ) : (
          <>
            {/* Logged In User Info */}
            <div className="clay-card p-4 mb-6">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-semibold">{loggedInUser.full_name || loggedInUser.email}</p>
                  <p className="text-sm text-gray-500">@{loggedInUser.username}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="clock" className="gap-2">
                  <History className="w-4 h-4" />
                  Time History
                </TabsTrigger>
                <TabsTrigger value="timeoff" className="gap-2">
                  <Calendar className="w-4 h-4" />
                  Time Off Requests
                </TabsTrigger>
                <TabsTrigger value="balance" className="gap-2">
                  <Briefcase className="w-4 h-4" />
                  My PTO Balance
                </TabsTrigger>
              </TabsList>

              <TabsContent value="clock">
                {/* Weekly Summary */}
                <div className="clay-card p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <h3 className="font-semibold">
                      Week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-purple-600">{weeklyHours.toFixed(2)} hrs</p>
                    <p className="text-sm text-gray-500">Total this week</p>
                    {overtimeHours > 0 && (
                      <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                        <span className="text-sm font-semibold">🕐 {overtimeHours.toFixed(2)} hrs overtime</span>
                      </div>
                    )}
                    {weeklyHours > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Regular: {regularHours.toFixed(2)} hrs
                        {overtimeHours > 0 && ` | OT: ${overtimeHours.toFixed(2)} hrs`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Time Entries List */}
                <div className="space-y-3">
                  {weeklyEntries.length === 0 ? (
                    <div className="clay-card p-6 text-center text-gray-500">
                      <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>No time entries for this week</p>
                    </div>
                  ) : (
                    weeklyEntries.map((entry, index) => {
                      // Calculate running total up to this entry to determine OT
                      const entriesUpToThis = weeklyEntries.slice(index);
                      const hoursBeforeThis = entriesUpToThis.slice(1).reduce((sum, e) => sum + (e.total_hours || 0), 0);
                      const entryHours = entry.total_hours || 0;
                      const entryRegular = Math.min(entryHours, Math.max(0, 40 - hoursBeforeThis));
                      const entryOT = Math.max(0, entryHours - entryRegular);
                      
                      return (
                      <div key={entry.id} className="clay-card p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold">{format(parseISO(entry.clock_in), "EEEE, MMM d")}</p>
                            <p className="text-sm text-gray-500">
                              {format(parseISO(entry.clock_in), "h:mm a")} 
                              {entry.clock_out && ` - ${format(parseISO(entry.clock_out), "h:mm a")}`}
                            </p>
                          </div>
                          <div className="text-right">
                            {entry.status === "clocked_in" ? (
                              <Badge className="bg-green-100 text-green-700">Active</Badge>
                            ) : (
                              <div>
                                <p className="text-lg font-bold text-purple-600">{entryHours.toFixed(2)} hrs</p>
                                {entryOT > 0 && (
                                  <p className="text-xs text-amber-600 font-medium">({entryOT.toFixed(2)} OT)</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {entry.lunch_minutes > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Coffee className="w-3 h-3" />
                            Lunch: {entry.lunch_minutes} min
                          </div>
                        )}

                        {entry.job_allocations && entry.job_allocations.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium text-gray-500 mb-2">Job Allocations:</p>
                            <div className="space-y-1">
                              {entry.job_allocations.map((job, i) => (
                                <div key={i} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                                  <div className="flex items-center gap-2">
                                    {job.is_inhouse ? (
                                      <>
                                        <Home className="w-3 h-3 text-amber-600" />
                                        <span>{job.inhouse_task}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Briefcase className="w-3 h-3 text-purple-600" />
                                        <span>{job.client_name}</span>
                                      </>
                                    )}
                                  </div>
                                  <span className="font-medium">{job.hours?.toFixed(2)} hrs</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes Section */}
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <FileText className="w-3 h-3" />
                              Notes:
                            </div>
                            {entry.status === "clocked_out" && editingNotes !== entry.id && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-xs"
                                onClick={() => startEditingNotes(entry)}
                              >
                                <Pencil className="w-3 h-3 mr-1" />
                                {entry.notes ? "Edit" : "Add"}
                              </Button>
                            )}
                          </div>
                          {editingNotes === entry.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editNotesText}
                                onChange={(e) => setEditNotesText(e.target.value)}
                                placeholder="Add notes about this time entry..."
                                className="text-sm min-h-[60px]"
                              />
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  className="h-7 px-3 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleSaveNotes(entry.id)}
                                >
                                  <Save className="w-3 h-3 mr-1" />
                                  Save
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-7 px-3"
                                  onClick={() => { setEditingNotes(null); setEditNotesText(""); }}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : entry.notes ? (
                            <p className="text-sm text-gray-600">{entry.notes}</p>
                          ) : (
                            <p className="text-sm text-gray-400 italic">No notes</p>
                          )}
                        </div>
                      </div>
                    );})
                  )}
                </div>
              </TabsContent>

              <TabsContent value="timeoff">
                <div className="space-y-3">
                  {timeOffRequests.length === 0 ? (
                    <div className="clay-card p-6 text-center text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>No time off requests</p>
                      <Button 
                        onClick={() => setShowTimeOffRequest(true)} 
                        variant="outline" 
                        className="mt-4"
                      >
                        Request Time Off
                      </Button>
                    </div>
                  ) : (
                    timeOffRequests.map(request => (
                      <div key={request.id} className="clay-card p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold capitalize">{request.request_type.replace("_", " ")}</p>
                            <p className="text-sm text-gray-500">
                              {format(parseISO(request.start_date), "MMM d, yyyy")}
                              {request.end_date !== request.start_date && 
                                ` - ${format(parseISO(request.end_date), "MMM d, yyyy")}`
                              }
                            </p>
                            <p className="text-sm text-gray-600 mt-1">{request.hours_requested} hours</p>
                            {request.reason && (
                              <p className="text-sm text-gray-500 mt-1">{request.reason}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {request.status === "pending" && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 px-2"
                                onClick={() => setEditingTimeOff(request)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            <Badge className={
                              request.status === "approved" ? "bg-green-100 text-green-700" :
                              request.status === "denied" ? "bg-red-100 text-red-700" :
                              "bg-yellow-100 text-yellow-700"
                            }>
                              {request.status === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
                              {request.status === "denied" && <XCircle className="w-3 h-3 mr-1" />}
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                        {request.admin_notes && (
                          <p className="text-sm text-gray-500 mt-2 italic">Admin: {request.admin_notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="balance">
                <PTOBalanceView currentUser={loggedInUser} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Dialogs */}
      {showClockOut && activeEntry && (
        <ClockOutDialog
          isOpen={showClockOut}
          onClose={() => setShowClockOut(false)}
          timeEntry={activeEntry}
          onClockOut={handleClockOut}
        />
      )}

      {showTimeOffRequest && loggedInUser && (
        <TimeOffRequestDialog
          isOpen={showTimeOffRequest}
          onClose={() => setShowTimeOffRequest(false)}
          currentUser={loggedInUser}
          onSubmit={loadData}
        />
      )}

      {editingTimeOff && (
        <TimeOffRequestDialog
          isOpen={!!editingTimeOff}
          onClose={() => setEditingTimeOff(null)}
          currentUser={loggedInUser}
          onSubmit={loadData}
          existingRequest={editingTimeOff}
        />
      )}

      <TimeClockLoginDialog
        isOpen={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onLogin={handleLogin}
        allUsers={allUsers}
      />
    </div>
  );
}