import 'bootstrap/dist/css/bootstrap.css';
import 'font-awesome/css/font-awesome.min.css';
import 'react-bootstrap-table/dist/react-bootstrap-table-all.min.css';
import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { createLogger } from 'redux-logger';
import thunkMiddleware from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';

import './styles.css';
import registerServiceWorker from './registerServiceWorker';
import { rootReducer } from './reducers';
import App from './components/App';
import { fetchChroms } from './actions.js'


const initialState = {}

const store =
  (process.env.NODE_ENV === 'production')
  ? createStore(rootReducer, initialState, applyMiddleware(thunkMiddleware))
  : createStore(rootReducer, initialState, applyMiddleware(thunkMiddleware, createLogger()))

render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.querySelector('#root')
)

store.dispatch(fetchChroms())


// Register service worker

registerServiceWorker()



// HMR

if (module.hot) {
  module.hot.accept(['./components/App'], () => {
    const NextApp = require('./components/App').default;
    render(
      <Provider store={store}>
        <NextApp />
      </Provider>,
      document.querySelector('#root')
    );
  });
}
