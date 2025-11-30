import React, { useEffect, useState } from "react";
import WelcomePage from "./WelcomePage";

type PropsType = {
  children: React.JSX.Element;
};

const Welcome = ({ children }: PropsType) => {
  const [finishedWelcome, setFinishedWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check isFirstRun from ConfigStore via IPC
    window.api.config.get<boolean>("isFirstRun").then((isFirstRun: boolean) => {
      setFinishedWelcome(!isFirstRun);
      setIsLoading(false);
    }).catch(() => {
      // Fallback: assume not first run if config fails
      setFinishedWelcome(true);
      setIsLoading(false);
    });
  }, []);

  const handleFinishWelcome = async () => {
    // Mark first run as complete in ConfigStore
    await window.api.config.set("isFirstRun", false);
    setFinishedWelcome(true);
  };

  if (isLoading) {
    return null; // Or a loading spinner
  }

  if (finishedWelcome) {
    return children;
  } else {
    return <WelcomePage onFinish={handleFinishWelcome} />;
  }
};

export default Welcome;
