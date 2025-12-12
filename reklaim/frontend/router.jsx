import { createBrowserRouter, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import OrderReturn from "./pages/OrderReturn";
import ReturnsDashboard from "./pages/ReturnsDashboard";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/company/1" replace />,
  },
  {
    path: "/company/:company_id/",
    element: <ReturnsDashboard />,
  },
  {
    path: '/company/:company_id/dashboard',
    element: <ReturnsDashboard />
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
    path: '/company/:company_id/application/:application_id/dashboard',
    element: <ReturnsDashboard />
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
    element: <ReturnsDashboard />,
  },
  {
    path: "/*", // Fallback route for all unmatched paths
    element: <NotFound />, // Component to render for unmatched paths
  },
]);

export default router;

