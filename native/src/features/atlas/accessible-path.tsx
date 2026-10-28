import { cloneElement } from 'react';
import { Path, type PathProps } from 'react-native-svg';
import type { AccessibilityProps } from 'react-native';

type AccessiblePathProps = PathProps & Pick<AccessibilityProps, 'accessibilityState' | 'accessibilityRole'>;
/** react-native-svg 15.16 extracts labels but drops role/state. Forward these
 * ViewProps to its native path, retaining Path's geometry, refs and responders. */
class NativeAccessiblePath extends Path {
 render() {
  const props=this.props as AccessiblePathProps;
  return cloneElement(super.render(), {
   accessibilityRole: props.accessibilityRole,
   accessibilityState: props.accessibilityState,
  });
 }
}

export function AccessiblePath(props: AccessiblePathProps) {
 return <NativeAccessiblePath {...props}/>;
}
