import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import NotFound from "./pages/NotFound";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/company/1" replace />,
  },
  {
    path: "/company/:company_id/",
    element: <App />,
  },
  {
    path: "/company/:company_id/application/:application_id",
    element: <App />,
  },
  {
    path: "/*", // Fallback route for all unmatched paths
    element: <NotFound />, // Component to render for unmatched paths
  },
]);

export default router;
