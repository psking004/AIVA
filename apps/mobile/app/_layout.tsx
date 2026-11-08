import React, { useEffect } from 'react';
import { Slot } from 'expo-router';

export default function RootLayout() {
  useEffect(() => {
    console.log('AIVA_JS_ROOT_MOUNTED');
  }, []);

  return <Slot />;
}
