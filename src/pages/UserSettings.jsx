import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import { sendGmail } from "@/functions/sendGmail";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Lock,
  Loader2,
  AlertCircle,
  Shield,
  Briefcase,
  Key,
  Mail,
  Check,
  UserCircle,
  Phone,
  MapPin,
  Heart,
  GraduationCap,
  Shirt,
  Users,
  Trash2,
  CalendarDays
} from "lucide-react";
import UserCalendarSettingsPanel from "@/components/calendar/UserCalendarSettingsPanel";
import TimeClockLoginDialog from "@/components/timeclock/TimeClockLoginDialog";
import UserHRDataForm from "@/components/user/UserHRDataForm";
import DeleteAccountSection from "@/components/user/DeleteAccountSection";
import { updateAuthorizedEmailIfUnchanged } from "@/components/admin/authorizedEmailPersistence";

export default function UserSettings() {
  const { currentUser } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");
  
  // Editable fields
  const [username, setUsername] = useState("");
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const users = await base44.entities.AuthorizedEmail.list();
      setAllUsers(users);
      
      // Find current user's data
      if (currentUser?.email) {
        const user = users.find(u => u.email?.toLowerCase() === currentUser.email.toLowerCase());
        if (user) {
          setUserData(user);
          setUsername(user.username || "");
        }
      }
    } catch (error) {
      console.error("Error loading users:", error);
    }
    setIsLoading(false);
  };

  const handleLogin = (user) => {
    // Verify the logged in user matches current user
    if (user.email?.toLowerCase() === currentUser?.email?.toLowerCase()) {
      setIsAuthenticated(true);
      setShowLoginDialog(false);
      setUserData(user);
      setUsername(user.username || "");
    } else {
      alert("You can only access your own settings");
    }
  };

  const handleSaveUsername = async () => {
    if (!userData) return;
    
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    
    try {
      // Check if username is taken
      if (username.trim()) {
        const existing = allUsers.find(u => 
          u.id !== userData.id && 
          u.username?.toLowerCase() === username.toLowerCase().trim()
        );
        if (existing) {
          setSaveError("This username is already taken");
          setIsSaving(false);
          return;
        }
      }
      
      const savedUser = await updateAuthorizedEmailIfUnchanged({
        entity: base44.entities.AuthorizedEmail,
        record: userData,
        nextFields: { username: username.toLowerCase().trim() },
        exactVersion: false,
        enforceIdentity: true,
        label: `Username for ${userData.full_name || userData.email}`
      });
      setUserData(savedUser);
      
      setSaveSuccess("Username updated successfully!");
      setTimeout(() => setSaveSuccess(""), 3000);
      loadUsers();
    } catch (error) {
      console.error("Username update blocked:", error);
      setSaveError(error?.message || "Failed to update username safely. Reload before retrying.");
    }
    setIsSaving(false);
  };

  const handleSendPasswordReset = async () => {
    if (!userData?.email) return;
    
    setSendingPasswordReset(true);
    try {
      const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);
      
      const resetUser = await updateAuthorizedEmailIfUnchanged({
        entity: base44.entities.AuthorizedEmail,
        record: userData,
        nextFields: {
          password_reset_token: resetToken,
          password_reset_expires: expires.toISOString()
        },
        exactVersion: false,
        enforceIdentity: false,
        label: `Password reset token for ${userData.full_name || userData.email}`
      });
      setUserData(resetUser);
      
      const appUrl = window.location.origin;
      const resetLink = `${appUrl}/ResetPassword?token=${resetToken}`;
      
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%); padding: 30px; border-radius: 16px; text-align: center;">
            <h1 style="color: #1F2937; margin: 0 0 10px 0;">🔐 Password Reset</h1>
            <p style="color: #374151; margin: 0;">Sign Shop Time Clock</p>
          </div>
          
          <div style="background: #FFFFFF; padding: 30px; border-radius: 16px; margin-top: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <p style="color: #1F2937; font-size: 16px;">Hi ${userData.full_name || 'there'},</p>
            <p style="color: #374151;">You requested to reset your Time Clock password. Click the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #7C3AED; color: #FFFFFF; padding: 16px 32px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: bold;">
                Reset My Password
              </a>
            </div>
            
            <p style="color: #6B7280; font-size: 14px;">This link will expire in 24 hours.</p>
          </div>
        </div>
      `;

      await sendGmail({
        to: userData.email,
        subject: "Reset Your Time Clock Password",
        body: emailBody
      });

      setPasswordResetSent(true);
      setTimeout(() => setPasswordResetSent(false), 5000);
    } catch (err) {
      console.error("Error sending password reset:", err);
      setSaveError(err?.message || "Failed to issue the password reset safely. Reload before retrying.");
    }
    setSendingPasswordReset(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-md mx-auto">
          <div className="clay-card p-8 text-center">
            <Lock className="w-16 h-16 text-purple-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">User Settings</h1>
            <p className="text-gray-600 mb-6">Please login with your Time Clock credentials to access your settings.</p>
            <Button
              onClick={() => setShowLoginDialog(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Lock className="w-4 h-4 mr-2" />
              Login to Continue
            </Button>
          </div>
        </div>
        
        <TimeClockLoginDialog
          isOpen={showLoginDialog}
          onClose={() => setShowLoginDialog(false)}
          onLogin={handleLogin}
          allUsers={allUsers}
        />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadUsers}>
    <div className="p-6">
      <div className="max-w-4xl mx-auto pb-8">
        <div className="flex items-center gap-4 mb-6">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl text-white"
            style={{
              background: userData?.role === 'admin'
                ? 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)'
                : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
            }}
          >
            {(userData?.full_name || userData?.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{userData?.full_name || "User Settings"}</h1>
            <p className="text-gray-500">{userData?.email}</p>
          </div>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="clay-card p-1">
            <TabsTrigger value="account" className="gap-2">
              <UserCircle className="w-4 h-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="personal" className="gap-2">
              <User className="w-4 h-4" />
              Personal Info
            </TabsTrigger>
            <TabsTrigger value="emergency" className="gap-2">
              <Phone className="w-4 h-4" />
              Emergency
            </TabsTrigger>
            <TabsTrigger value="qualifications" className="gap-2">
              <GraduationCap className="w-4 h-4" />
              Qualifications
            </TabsTrigger>
            <TabsTrigger value="clothing" className="gap-2">
              <Shirt className="w-4 h-4" />
              Clothing
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              Calendar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <div className="space-y-6">
              {/* Account Info */}
              <div className="clay-card p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-600" />
                  Account Information
                </h2>
                
                <div className="space-y-4">
                  {/* Email - Read Only */}
                  <div>
                    <Label className="text-sm text-gray-500">Email Address</Label>
                    <Input value={userData?.email || ""} disabled className="mt-1 bg-gray-100" />
                    <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
                  </div>

                  {/* Role - Read Only */}
                  <div>
                    <Label className="text-sm text-gray-500">Role</Label>
                    <div className="mt-1">
                      <Badge className={userData?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                        {userData?.role === 'admin' ? 'Admin' : 'User'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Contact an admin to change your role</p>
                  </div>

                  {/* Sales Roles - Read Only */}
                  {userData?.sales_roles?.length > 0 && (
                    <div>
                      <Label className="text-sm text-gray-500">Sales Pipeline Roles</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {userData.sales_roles.map(role => (
                          <Badge key={role} variant="outline" className="text-xs">
                            <Briefcase className="w-3 h-3 mr-1" />
                            {role}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Contact an admin to change your roles</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Login Credentials */}
              <div className="clay-card p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Key className="w-5 h-5 text-purple-600" />
                  Login Credentials
                </h2>
                
                <div className="space-y-4">
                  {/* Username - Editable */}
                  <div>
                    <Label className="text-sm text-gray-500">Username</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                        placeholder="Enter username"
                        className="flex-1"
                      />
                      <Button
                        onClick={handleSaveUsername}
                        disabled={isSaving || username === userData?.username}
                        className="clay-button"
                        style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Used for Time Clock quick login</p>
                  </div>

                  {/* Password - Request Reset */}
                  <div>
                    <Label className="text-sm text-gray-500">Password</Label>
                    <div className="mt-1">
                      <Button
                        onClick={handleSendPasswordReset}
                        disabled={sendingPasswordReset}
                        variant="outline"
                        className="gap-2"
                      >
                        {sendingPasswordReset ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : passwordResetSent ? (
                          <>
                            <Check className="w-4 h-4 text-green-600" />
                            Email Sent!
                          </>
                        ) : (
                          <>
                            <Mail className="w-4 h-4" />
                            Send Password Reset Email
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">We'll send a secure link to {userData?.email}</p>
                  </div>

                  {saveSuccess && (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <Check className="w-4 h-4" />
                      {saveSuccess}
                    </div>
                  )}
                  {saveError && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {saveError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personal">
            <UserHRDataForm 
              userData={userData} 
              onUpdate={loadUsers}
              section="personal"
            />
          </TabsContent>

          <TabsContent value="emergency">
            <UserHRDataForm 
              userData={userData} 
              onUpdate={loadUsers}
              section="emergency"
            />
          </TabsContent>

          <TabsContent value="qualifications">
            <UserHRDataForm 
              userData={userData} 
              onUpdate={loadUsers}
              section="qualifications"
            />
          </TabsContent>

          <TabsContent value="clothing">
            <UserHRDataForm 
              userData={userData} 
              onUpdate={loadUsers}
              section="clothing"
            />
          </TabsContent>

          <TabsContent value="calendar">
            <div className="clay-card p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-purple-600" />
                My Calendar Preferences
              </h2>
              <UserCalendarSettingsPanel
                userEmail={userData?.email}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span><strong>Privacy Notice:</strong> Your HR and personal data is only accessible by office administrators and is kept secure.</span>
          </p>
        </div>

        {/* Delete Account */}
        <DeleteAccountSection userData={userData} />
      </div>
    </div>
    </PullToRefresh>
  );
}