import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Simulator from "./pages/Simulator";
import { LegalPage } from "./pages/Legal";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/marketplace/landing" element={<Landing />} />
      <Route path="/app" element={<Dashboard />} />
      <Route path="/simulator" element={<Simulator />} />
      <Route
        path="/privacy"
        element={
          <LegalPage
            title="Privacy"
            lead="How Aether handles account and Marketplace subscription data."
            body={[
              "This demo stores accounts, organizations, and Marketplace subscription rows on the machine running the API.",
              "Purchase identification tokens are used only to call Resolve. Publisher credentials never ship to the browser.",
              "Microsoft sign-in on the landing page proves the person in the browser is the purchaser (oid + tid).",
            ]}
          />
        }
      />
      <Route
        path="/terms"
        element={
          <LegalPage
            title="Terms / EULA"
            lead="Demo license for testing Microsoft Marketplace fulfillment."
            body={[
              "Aether is a standalone sample application. It is not Fydelitics and does not connect to production customer data.",
              "Marketplace billing starts only after Activate. Auto-activation is off.",
              "Plans map starter, pro, and enterprise planIds to in-app entitlements.",
            ]}
          />
        }
      />
      <Route
        path="/support"
        element={
          <LegalPage
            title="Support"
            lead="If a Marketplace purchase cannot reach the product."
            body={[
              "Expired landing link: return to Azure portal → Configure account. Tokens last 24 hours.",
              "Wrong Microsoft account: sign in with the same work or personal account used on the Marketplace order.",
              "Suspended or cancelled: the workspace still signs in, but the product is closed until the subscription is reinstated.",
            ]}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
