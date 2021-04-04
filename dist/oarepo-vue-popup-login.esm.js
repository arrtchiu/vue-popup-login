import { BroadcastChannel } from 'broadcast-channel';
import { defineComponent, reactive, ref } from '@vue/composition-api';
import axios from 'axios';
import { isMatch } from 'lodash';

function normalizeUrl(url) {
    return (new URL(url, window.location.href)).toString();
}

const REDIRECT_LOGIN = Symbol('redirect-login');
const CANCEL_NAVIGATION = Symbol('cancel-navigation');
const CONTINUE_NAVIGATION = Symbol('continue-navigation');

function getAuthorizationFromRoute(route) {
    let ret = undefined;
    route.matched.forEach(m => {
        if (m.meta && m.meta.authorization !== undefined) {
            if (ret === undefined) {
                ret = Object.assign({ needsRequired: [] }, m.meta.authorization);
            }
            else {
                ret.needsRequired.push(...(m.meta.authorization.needsRequired || []));
            }
        }
    });
    return ret;
}

var AuthorizedLink = defineComponent({
    name: 'authorized-link',
    props: ['component', 'to'],
    computed: {
        propsAndAttrs() {
            return Object.assign(Object.assign({}, this.$props), this.$attrs);
        },
        resolved() {
            return this.$router.resolve(this.to);
        },
        authorized() {
            if (!this.resolved) {
                return false;
            }
            const routeAuthorization = getAuthorizationFromRoute(this.resolved.route);
            if (!routeAuthorization) {
                return true;
            }
            return this.$auth.hasAccess(routeAuthorization.needsRequired, {
                route: this.resolved.route
            });
        }
    },
    render(h) {
        if (this.authorized) {
            // return the rendered component
            return h(this.component, {
                props: this.propsAndAttrs
            }, this.$slots.default);
        }
        else if (!this.resolved) {
            return h('div', [
                h('pre', JSON.stringify(this.to))
            ]);
        }
        return null;
    }
});

const DEFAULT_LOGIN_URL = '/auth/login';
const DEFAULT_COMPLETE_URL = '/auth/complete';
const DEFAULT_LOGOUT_URL = '/auth/logout';
const DEFAULT_STATE_URL = '/auth/state';
const DEFAULT_NEXT_QUERY_PARAM = 'next';
// @vue/composition-api must be initialized so can not have the reactive property here
// (as the file might be imported before Vue.use(CompositionApi) )
const pluginData = {
    loginOptions: null,
    loginData: null,
    loginState: null
};
/**
 * Provides access to the login state. The first time (in main.js or app's setup)
 * you call it, it will get initialized. Other times it will just return the initialized
 * copy.
 *
 * You can use it either the composition-style (that is, in setup() function call usePopupLogin
 * and use it there), or can use the provided Vue.use(popupLoginPlugin, {})
 *
 * @param loginUrl
 * @param logoutUrl
 * @param completeUrl
 * @param redirectionCompleteUrl
 * @param stateUrl
 * @param nextQueryParam
 * @param loginStateTransformer
 * @param popupFailedHandler
 */
function usePopupLogin(options) {
    const { loginUrl, logoutUrl, logoutMethod, completeUrl, redirectionCompleteUrl, stateUrl, nextQueryParam, loginStateTransformer, popupFailedHandler, loginRequiredHandler, noAccessHandler } = options || {};
    if (pluginData.loginOptions === null) {
        Object.assign(pluginData, {
            loginOptions: reactive({
                loginUrl: null,
                logoutUrl: null,
                logoutMethod: 'GET',
                completeUrl: null,
                redirectionCompleteUrl: null,
                stateUrl: null,
                nextQueryParam: null,
                loginStateTransformer: null,
                popupFailedHandler: null,
                loginRequiredHandler: null,
                noAccessHandler: null
            }),
            loginData: reactive({
                channel: null,
                promises: [],
                popup: null
            }),
            loginState: ref({ loggedIn: false, needsProvided: [] })
        });
    }
    const loginOptions = pluginData.loginOptions;
    const loginState = pluginData.loginState; // eslint-disable-line
    const loginData = pluginData.loginData;
    function callCallback(msg) {
        if (loginData.callback) {
            const callback = loginData.callback;
            loginData.callback = undefined;
            callback(msg);
        }
        else {
            setTimeout(() => callCallback(msg), 1000);
        }
    }
    if (!loginOptions.loginUrl) {
        // not yet initialized
        loginOptions.loginUrl = loginUrl || DEFAULT_LOGIN_URL;
        loginOptions.logoutUrl = logoutUrl || DEFAULT_LOGOUT_URL;
        loginOptions.logoutMethod = logoutMethod || 'GET';
        loginOptions.completeUrl = completeUrl || DEFAULT_COMPLETE_URL;
        loginOptions.redirectionCompleteUrl = redirectionCompleteUrl || null;
        loginOptions.stateUrl = stateUrl || DEFAULT_STATE_URL;
        loginOptions.nextQueryParam = nextQueryParam || DEFAULT_NEXT_QUERY_PARAM;
        loginOptions.loginStateTransformer = loginStateTransformer;
        loginOptions.loginRequiredHandler = loginRequiredHandler || (async () => {
            alert('Redirecting you to log in');
            return REDIRECT_LOGIN;
        });
        loginOptions.popupFailedHandler = popupFailedHandler || (async () => {
            alert('Redirecting you to log in');
            return REDIRECT_LOGIN;
        });
        loginOptions.noAccessHandler = noAccessHandler || (async () => {
            alert('You have no access to the resource. Redirecting you to log in');
            window.location.href = loginOptions.logoutUrl;
            return false; // just to make typescript happy
        });
        loginData.channel = new BroadcastChannel('popup-login-channel');
        loginData.channel.onmessage = function (msg) {
            if (msg.data.type === 'login') {
                callCallback(msg.data);
                loginData.popup.close();
                loginData.popup = null;
            }
        };
    }
    function redirectLogin() {
        const finalRedirectionUrl = new URL(loginOptions.completeUrl, window.location.href);
        finalRedirectionUrl.searchParams.append(loginOptions.nextQueryParam, loginOptions.redirectionCompleteUrl
            ? normalizeUrl(loginOptions.redirectionCompleteUrl)
            : window.location.href);
        const redirectionUrl = new URL(loginOptions.loginUrl, window.location.href);
        redirectionUrl.searchParams.append(loginOptions.nextQueryParam, finalRedirectionUrl.toString());
        window.location.href = redirectionUrl.toString();
    }
    function _handleFailedLoginPopup(resolve) {
        loginOptions.popupFailedHandler().then((state) => {
            if (state === REDIRECT_LOGIN) {
                redirectLogin();
                // no need to finish the promise as we are leaving the page
            }
            else {
                // got login, so resolve with it
                resolve(state);
            }
        });
    }
    async function check(localStateSufficient = false) {
        if (loginState.value.loggedIn && localStateSufficient) {
            return loginState.value;
        }
        const resp = await axios.get(loginOptions.stateUrl);
        loginState.value = loginOptions.loginStateTransformer
            ? loginOptions.loginStateTransformer(resp.data)
            : resp.data;
        return loginState.value;
    }
    function clearLoginState() {
        loginState.value = {
            loggedIn: false,
            needsProvided: []
        };
    }
    function login() {
        if (loginState.value.loggedIn) {
            return Promise.resolve(true);
        }
        // popup the login as soon as possible - that's why the function is not async
        const loginUrl = new URL(loginOptions.loginUrl, window.location.href);
        loginUrl.searchParams.append(loginOptions.nextQueryParam, normalizeUrl(loginOptions.completeUrl));
        const currentPopup = window.open(loginUrl.toString(), '_blank');
        loginData.popup = currentPopup;
        return new Promise((resolve) => {
            if (!currentPopup) {
                return _handleFailedLoginPopup(resolve);
            }
            loginData.callback = (async () => {
                await check(false);
                resolve(loginState.value.loggedIn);
            });
        });
    }
    function logout() {
        if (loginOptions.logoutMethod === 'GET') {
            window.location.href = loginOptions.logoutUrl;
        }
        else {
            axios.post(loginOptions.logoutUrl).then(() => {
                window.location.href = '/';
            });
        }
    }
    /**
     * Ask the loginRequiredHandler to show login popup
     *
     * @returns  REPEAT_LOGIN if user clicked on the login button and a new popup login has started
     * @returns  REDIRECT_LOGIN if user wants to log in via redirect
     * @returns  CANCEL_NAVIGATION do not allow the navigation, call next(false) in route guard
     * @returns  CONTINUE_NAVIGATION the login information has been acquired outside of the library, it is ok to continue
     * @returns  {string} navigate browser to this location via windows.location.href - this will reload the app
     * @returns  Location navigate router to this location
     */
    function showLoginPopup(extra) {
        return loginOptions.loginRequiredHandler(extra);
    }
    /**
     * Ask the noAccessHandler to show login popup. The handler should
     *
     * @param extra extra arguments for the handler
     * @returns  REPEAT_LOGIN if user clicked on the login button and a new popup login has started
     * @returns  REDIRECT_LOGIN if user wants to log in via redirect
     * @returns  CANCEL_NAVIGATION do not allow the navigation, call next(false) in route guard
     * @returns  CONTINUE_NAVIGATION the login information has been acquired outside of the library, it is ok to continue
     * @returns  {string} navigate browser to this location via windows.location.href - this will reload the app
     * @returns  Location navigate router to this location
     */
    function showNoAccessPopup(extra) {
        return loginOptions.noAccessHandler(loginState.value, extra);
    }
    function isAuthorized(state, needsRequired, needsProvided, extra) {
        // sanity check
        needsProvided = needsProvided || [];
        needsRequired = needsRequired || [];
        if (!needsRequired.length && state.loggedIn) {
            return true;
        }
        // check if there is a requiredNeed that is contained in the provided needs
        // if there is at least one, the person is authorized
        for (const requiredNeed of needsRequired) {
            // if the required need is a string, look in all provided needs
            // if there is a string with the same value
            if (typeof requiredNeed === 'string') {
                if (needsProvided.indexOf(requiredNeed) >= 0) {
                    return true;
                }
                // if the required need is a function, apply it and if it returns true,
                // consider the need to be fulfilled
            }
            else if (typeof requiredNeed === 'function') {
                if (requiredNeed(state, needsProvided, extra)) {
                    return true;
                }
                // if the need is an object, it must be contained in at least
                // one of the provided needs to be marked as fulfilled
            }
            else {
                if (needsProvided.some(n => {
                    if (typeof n === 'string' || typeof n === 'function') {
                        return false;
                    }
                    return isMatch(n, requiredNeed);
                }))
                    return true;
            }
        }
        return false;
    }
    function hasAccess(needsRequired, extra) {
        if (!loginState.value.loggedIn) {
            return false;
        }
        return isAuthorized(loginState.value, needsRequired, loginState.value.needsProvided, extra);
    }
    /**
     * Makes sure the user is logged in and has the required needs
     *
     * @param needsRequired a list of needs that the user must provide
     * @param extra extra arguments for login and no access handlers
     *
     * @return true if user is logged in and provides all the needs required
     *
     * @throws CANCEL_NAVIGATION  user has no rights and does not want to continue
     * @throws CONTINUE_NAVIGATION handler wants to continue navigation even though user has no rights
     * @throws {Location} asking the caller to router-navigate to this location
     */
    async function loginAndAuthorize(needsRequired, extra) {
        let state = 'initial';
        while (true) { // eslint-disable-line
            switch (state) {
                case 'initial': {
                    const authState = await check(true);
                    if (authState.loggedIn) {
                        state = 'logged-in';
                    }
                    else {
                        state = 'logged-out';
                    }
                    break;
                }
                case 'logged-out': {
                    const loginPopupOutcome = await showLoginPopup(extra);
                    if (loginPopupOutcome === true) {
                        state = 'logged-in';
                    }
                    else if (loginPopupOutcome === false) {
                        continue;
                    }
                    else if (loginPopupOutcome === REDIRECT_LOGIN) {
                        redirectLogin();
                    }
                    else {
                        return loginPopupOutcome; // navigation outcome
                    }
                    break;
                }
                case 'logged-in': {
                    const authorized = isAuthorized(loginState.value, needsRequired, loginState.value.needsProvided, extra);
                    if (authorized) {
                        return true;
                    }
                    state = 'not-authorized';
                    break;
                }
                case 'not-authorized': {
                    const loginOutcome = await showNoAccessPopup(extra);
                    if (loginOutcome === true) {
                        state = 'logged-in';
                    }
                    else if (loginOutcome === false) {
                        state = 'initial';
                    }
                    else if (loginOutcome == REDIRECT_LOGIN) {
                        redirectLogin();
                    }
                    else {
                        return loginOutcome;
                    }
                    break;
                }
            }
        }
    }
    function registerPopupFailedHandler(handler) {
        loginOptions.popupFailedHandler = handler;
    }
    function registerLoginRequiredHandler(handler) {
        loginOptions.loginRequiredHandler = handler;
    }
    function registerNoAccessHandler(handler) {
        loginOptions.noAccessHandler = handler;
    }
    return {
        options: loginOptions,
        state: loginState,
        clearLoginState,
        check,
        login,
        logout,
        isAuthorized,
        loginAndAuthorize,
        hasAccess,
        registerPopupFailedHandler,
        registerLoginRequiredHandler,
        registerNoAccessHandler
    };
}
/**
 * Vue plugin. Do not forget to call Vue.use(compositionApi) before
 * using this plugin.
 *
 * @param Vue           current Vue
 * @param options       login options
 */
function popupLoginPlugin(Vue, options) {
    const $auth = usePopupLogin(options);
    Vue.component('authorized-link', AuthorizedLink);
    Vue.prototype.$auth = $auth;
    if (options.router) {
        options.router.beforeEach(async (to, from, next) => {
            const authorization = getAuthorizationFromRoute(to);
            if (!authorization) {
                next();
            }
            else {
                const authorizedOrLocation = await $auth.loginAndAuthorize(authorization.needsRequired || [], {
                    route: to
                });
                if (authorizedOrLocation === true || authorizedOrLocation === CONTINUE_NAVIGATION) {
                    next();
                }
                else if (authorizedOrLocation === CANCEL_NAVIGATION) {
                    next(false);
                }
                else {
                    // otherwise it is a location
                    next(authorizedOrLocation);
                }
            }
        });
    }
}

export default popupLoginPlugin;
export { CANCEL_NAVIGATION, CONTINUE_NAVIGATION, REDIRECT_LOGIN, usePopupLogin };
