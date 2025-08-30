

// pages/_app.js (for Pages Router)

import '../styles/globals.css';

function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
    </>
  );
}

export default App;