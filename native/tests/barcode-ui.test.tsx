import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { FoodScreen } from '../src/features/food/screen';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
const mockRequest=jest.fn();let mockGranted=false;
let mockCameraProps:Record<string,any>={};
jest.mock('expo-camera',()=>({useCameraPermissions:()=>[{granted:mockGranted},mockRequest],CameraView:(props:Record<string,any>)=>{mockCameraProps=props;return null;}}));
jest.mock('@react-native-picker/picker',()=>{const React=require('react');const {View}=require('react-native');const Picker=(props:any)=>React.createElement(View,props);Picker.Item=()=>null;return {Picker};});
const wrapper=({children}:{children:React.ReactNode})=><ThemeProvider>{children}</ThemeProvider>;
const code='0000000000017';
const originalFetch=global.fetch;
let mockHttp:jest.Mock;
afterEach(()=>{global.fetch=originalFetch;});
beforeEach(()=>{mockGranted=false;mockRequest.mockReset();mockCameraProps={};mockHttp=jest.fn();global.fetch=mockHttp;});
test('permission is just in time; denied camera retains manual code and food entry',async()=>{
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});expect(mockRequest).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:'Scan'}));expect(mockRequest).not.toHaveBeenCalled();
 mockRequest.mockResolvedValue({granted:false});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 expect(mockRequest).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('Barcode number')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Enter food manually'}));expect(screen.getByLabelText('Food name')).toBeTruthy();expect(mockHttp).not.toHaveBeenCalled();
});
test('fan Scan opens camera; torch and barcode callback; cached serving selection reaches editable entry',async()=>{
 const repo=memoryRepository();repo.localSave('barcode:v1:'+code,{food:{name:'Synthetic cereal',energy_kj:418.4,protein_g:0,carbs_g:0,fat_g:0,amount_g:100},servingGrams:40});
 await render(<FoodScreen repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'More food logging options'}));await fireEvent.press(screen.getByRole('button',{name:'+ Scan'}));
 mockRequest.mockResolvedValue({granted:true});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 await fireEvent.press(screen.getByRole('button',{name:'Turn torch on'}));expect(mockCameraProps.enableTorch).toBe(true);
 await act(async()=>{await mockCameraProps.onBarcodeScanned({data:code});});
 expect(screen.getByText('Label calories differ from 4/4/9 macro calories by more than 15%. Keeping the label value.')).toBeTruthy();
 await fireEvent(screen.getByLabelText('Serving size'),'valueChange',50);
 await fireEvent.press(screen.getByRole('button',{name:'Use this food'}));expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('50');
 expect(mockHttp).not.toHaveBeenCalled();
});
test('not-found offers manual or AI placeholder and never sends a photo',async()=>{
 mockHttp.mockResolvedValue({ok:true,status:200,json:async()=>({status:0})});
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 await fireEvent.changeText(screen.getByLabelText('Barcode number'),code);await fireEvent.press(screen.getByRole('button',{name:'Look up barcode'}));
 expect(screen.getByText('Food not found. Enter it manually or try AI photo.')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'AI photo'}));expect(screen.getByText('AI photo is not available yet. You can enter food manually now.')).toBeTruthy();expect(mockHttp).toHaveBeenCalledTimes(1);
});

test('macro calories are opt-in and cancel never logs food',async()=>{
 const repo=memoryRepository();repo.localSave('barcode:v1:'+code,{food:{name:'Synthetic cereal',energy_kj:418.4,protein_g:10,carbs_g:0,fat_g:0,amount_g:100},servingGrams:null});
 await render(<FoodScreen repository={repo}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 await fireEvent.changeText(screen.getByLabelText('Barcode number'),code);await fireEvent.press(screen.getByRole('button',{name:'Look up barcode'}));
 await fireEvent.press(screen.getByRole('button',{name:'Use macro-based calories'}));
 expect(screen.getByText('Using macro-based calories. You can switch back to the label value.')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Use this food'}));expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('40');
 await fireEvent.press(screen.getByRole('button',{name:'Cancel'}));expect(repo.list('food_entries')).toHaveLength(0);
});

test('backgrounding releases the camera and resets the torch',async()=>{
 const listener=AppState.addEventListener as jest.Mock;
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 mockRequest.mockResolvedValue({granted:true});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 await fireEvent.press(screen.getByRole('button',{name:'Turn torch on'}));
 const onChange=listener.mock.calls.filter(([event])=>event==='change').at(-1)![1];
 await act(()=>onChange('background'));
 expect(screen.queryByRole('button',{name:'Turn torch off'})).toBeNull();
 await act(()=>onChange('active'));
 await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 expect(mockCameraProps.enableTorch).toBe(false);
});

test('failed lookup can retry and duplicate scanner callbacks send only one request',async()=>{
 let reject!:(error:Error)=>void;
 mockHttp.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 mockRequest.mockResolvedValue({granted:true});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 const scan=mockCameraProps.onBarcodeScanned;
 await act(()=>{scan({data:code});scan({data:code});});
 expect(mockHttp).toHaveBeenCalledTimes(1);
 await act(()=>reject(new Error('offline')));
 expect(screen.getByText('Could not look up this barcode. Check the code or connection and try again.')).toBeTruthy();
 mockHttp.mockResolvedValue({ok:true,status:200,json:async()=>({status:0})});
 await fireEvent.press(screen.getByRole('button',{name:'Look up barcode'}));
 expect(mockHttp).toHaveBeenCalledTimes(2);
 expect(screen.getByText('Food not found. Enter it manually or try AI photo.')).toBeTruthy();
});
