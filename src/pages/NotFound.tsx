import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 — attempted route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
      <div className="text-center space-y-2">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <p className="text-xl font-semibold text-foreground">Page not found</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono bg-muted px-2 py-0.5 rounded">{location.pathname}</span>
          {" "}doesn't exist.
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
        <Button onClick={() => navigate("/")}>
          <Home className="mr-2 h-4 w-4" /> Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;