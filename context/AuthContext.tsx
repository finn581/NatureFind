import React, { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import { type User } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithGoogle,
  signInWithApple,
  signInWithEmail as fbSignInWithEmail,
  signOut as fbSignOut,
} from "@/services/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
}

type AuthAction =
  | { type: "SET_USER"; user: User | null }
  | { type: "SET_LOADING"; loading: boolean };

interface AuthContextValue extends AuthState {
  signInGoogle: (idToken: string) => Promise<void>;
  signInApple: (idToken: string, nonce: string) => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.user, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, { user: null, loading: true });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      dispatch({ type: "SET_USER", user });
    });
    return unsubscribe;
  }, []);

  const signInGoogle = async (idToken: string) => {
    dispatch({ type: "SET_LOADING", loading: true });
    await signInWithGoogle(idToken);
  };

  const signInApple = async (idToken: string, nonce: string) => {
    dispatch({ type: "SET_LOADING", loading: true });
    await signInWithApple(idToken, nonce);
  };

  const signInEmail = async (email: string, password: string) => {
    dispatch({ type: "SET_LOADING", loading: true });
    await fbSignInWithEmail(email, password);
  };

  const signOut = async () => {
    await fbSignOut();
  };

  return (
    <AuthContext.Provider value={{ ...state, signInGoogle, signInApple, signInEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
