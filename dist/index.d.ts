import _Vue from 'vue';
import { Ref } from '@vue/composition-api';
import { AuthenticationState, CANCEL_NAVIGATION, CONTINUE_NAVIGATION, LoginRequiredHandler, LoginStateTransformer, NavigationOutcome, Need, NoAccessHandler, PopupFailedHandler, PopupLoginPluginOptions, REDIRECT_LOGIN, UsePopupLoginOptions } from './types';
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
export declare function usePopupLogin<UserAuthenticationState extends AuthenticationState>(options?: UsePopupLoginOptions<UserAuthenticationState>): {
    options: {
        loginUrl: string;
        logoutUrl: string;
        logoutMethod: 'GET' | 'POST';
        completeUrl: string;
        redirectionCompleteUrl: string | null;
        stateUrl: string;
        nextQueryParam: string;
        loginStateTransformer: LoginStateTransformer<UserAuthenticationState>;
        popupFailedHandler: PopupFailedHandler;
        loginRequiredHandler: LoginRequiredHandler;
        noAccessHandler: NoAccessHandler;
    };
    state: Ref<UserAuthenticationState>;
    clearLoginState: () => void;
    check: (localStateSufficient?: boolean) => Promise<UserAuthenticationState>;
    login: () => Promise<boolean>;
    logout: () => void;
    isAuthorized: (state: UserAuthenticationState, needsRequired: Need<UserAuthenticationState>[], needsProvided: Need<UserAuthenticationState>[], extra: any) => boolean;
    loginAndAuthorize: (needsRequired: Need<UserAuthenticationState>[], extra: any) => Promise<boolean | NavigationOutcome>;
    hasAccess: (needsRequired: Need<UserAuthenticationState>[], extra: any) => boolean;
    registerPopupFailedHandler: (handler: PopupFailedHandler) => void;
    registerLoginRequiredHandler: (handler: LoginRequiredHandler) => void;
    registerNoAccessHandler: (handler: NoAccessHandler) => void;
};
/**
 * Vue plugin. Do not forget to call Vue.use(compositionApi) before
 * using this plugin.
 *
 * @param Vue           current Vue
 * @param options       login options
 */
export default function popupLoginPlugin<UserAuthenticationState extends AuthenticationState>(Vue: typeof _Vue, options: PopupLoginPluginOptions<UserAuthenticationState>): void;
export { REDIRECT_LOGIN, CANCEL_NAVIGATION, CONTINUE_NAVIGATION };
