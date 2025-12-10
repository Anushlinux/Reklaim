import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import NotFound from "./pages/NotFound";

import Settings from "./pages/Settings";
import OrderReturn from "./pages/OrderReturn";

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
    path: '/company/:company_id/settings',
    element: <Settings />
  },
  {
    path: '/company/:company_id/returns',
    element: <OrderReturn />
  },
  {
    path: '/company/:company_id/returns/:product_id',
    element: <OrderReturn />
  },
  {
    path: '/company/:company_id/application/:application_id/settings',
    element: <Settings />
  },
  {
    path: '/company/:company_id/application/:application_id/returns',
    element: <OrderReturn />
  },
  {
    path: '/company/:company_id/application/:application_id/returns/:product_id',
    element: <OrderReturn />
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

