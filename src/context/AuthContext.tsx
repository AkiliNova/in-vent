import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, db } from "@/firebase/firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  User,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  tenantId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(
    localStorage.getItem("tenantId") || null
  );

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
          if (adminDoc.exists()) {
            const tid = adminDoc.data().tenantId || null;
            setTenantId(tid);
            localStorage.setItem("tenantId", tid || "");
          } else {
            // Admin doc missing — maybe new user not onboarded yet
            setTenantId(null);
            localStorage.removeItem("tenantId");
          }
        } catch (err) {
          console.error("Failed to fetch tenantId:", err);
          setTenantId(null);
          localStorage.removeItem("tenantId");
        }
      } else {
        setTenantId(null);
        localStorage.removeItem("tenantId");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Login with email/password
  const login = async (email: string, password: string) => {
    await setPersistence(auth, browserLocalPersistence); // persist session
    const res = await signInWithEmailAndPassword(auth, email, password);
    setUser(res.user);

    try {
      const adminDoc = await getDoc(doc(db, "admins", res.user.uid));
      if (adminDoc.exists()) {
        const tid = adminDoc.data().tenantId || null;
        setTenantId(tid);
        localStorage.setItem("tenantId", tid || "");
      } else {
        setTenantId(null);
        localStorage.removeItem("tenantId");
      }
    } catch (err) {
      console.error("Failed to fetch tenantId on login:", err);
      setTenantId(null);
      localStorage.removeItem("tenantId");
    }

    return res.user;
  };

  // Logout
  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setTenantId(null);
    localStorage.removeItem("tenantId");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        tenantId,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
