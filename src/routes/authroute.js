import { Router } from "express";
import passport from "passport";
import "../strategies/index.js";
import { validateLogin } from "../validation/index.js";
const authRoute = Router();

authRoute.post("/login", validateLogin, (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return res
        .status(401)
        .json({ message: err.message || "Authentication error" });
    }

    if (!user) {
      return res.status(401).json({
        message: info?.message || "Invalid credentials",
      });
    }

    // Log the user in
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ message: loginErr.message })
      }

      const { passwordHash, ...safeUser } = user;

      return res.status(200).json({
        success: true,
        user: safeUser,
        message: "Login successful",
      });
    });
  })(req, res, next);
});

authRoute.post("/logout", (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) return next(logoutError);

    req.session.destroy((sessionError) => {
      if (sessionError) return next(sessionError);
      res.clearCookie("connect.sid");
      return res.status(204).send();
    });
  });
});

export default authRoute;
