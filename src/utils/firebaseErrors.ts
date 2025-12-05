export const firebaseErrorMessage = (code: string): string => {
  switch (code) {
    case "auth/invalid-credential":
      return "Invalid email or password";
    case "auth/user-not-found":
      return "User not found";
    case "auth/wrong-password":
      return "Incorrect password";
    case "auth/too-many-requests":
      return "Too many login attempts. Try again later.";

    default:
      return "Login failed. Please try again.";
  }
};
