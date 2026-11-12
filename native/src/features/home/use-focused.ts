import * as Router from 'expo-router';

// Outside a navigator build (tests that stand the router in) the screen simply counts as in front.
const hook: () => boolean = typeof Router.useIsFocused === 'function' ? Router.useIsFocused : () => true;
/** True while this screen is the one in front. */
export const useFocused = () => hook();
