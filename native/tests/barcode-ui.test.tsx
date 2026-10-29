import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';
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
test('split Scan opens camera; torch and barcode callback; cached serving selection reaches editable entry',async()=>{
 const repo=memoryRepository();repo.localSave('barcode:v2',{[code]:{fetchedAt:Date.now(),product:{food:{name:'Synthetic cereal',energy_kj:418.4,protein_g:0,carbs_g:0,fat_g:0,amount_g:100},servingGrams:40}}});
 await render(<FoodScreen repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 mockRequest.mockResolvedValue({granted:true});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 await fireEvent.press(screen.getByRole('button',{name:'Turn torch on'}));expect(mockCameraProps.enableTorch).toBe(true);
 await act(async()=>{await mockCameraProps.onBarcodeScanned({data:code});});
 expect(screen.getByText('Label calories differ from 4/4/9 macro calories by more than 15%. Keeping the label value.')).toBeTruthy();
 await fireEvent(screen.getByLabelText('Serving size'),'valueChange',50);
 await fireEvent.press(screen.getByRole('button',{name:'Use this food'}));expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('50');
 expect(mockHttp).not.toHaveBeenCalled();
});
test('not-found offers manual entry and hides unavailable AI photo',async()=>{
 mockHttp.mockResolvedValue({ok:true,status:200,body:{getReader:()=>{let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode('{"status":0}')}),cancel:jest.fn(),releaseLock:jest.fn()};}}});
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 await fireEvent.changeText(screen.getByLabelText('Barcode number'),code);await fireEvent.press(screen.getByRole('button',{name:'Look up barcode'}));
 expect(screen.getByText('Food not found. Enter it manually.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'AI photo'})).toBeNull();expect(mockHttp).toHaveBeenCalledTimes(1);
});

test('macro calories are opt-in and cancel never logs food',async()=>{
 const repo=memoryRepository();repo.localSave('barcode:v2',{[code]:{fetchedAt:Date.now(),product:{food:{name:'Synthetic cereal',energy_kj:418.4,protein_g:10,carbs_g:0,fat_g:0,amount_g:100},servingGrams:null}}});
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
 mockHttp.mockResolvedValue({ok:true,status:200,body:{getReader:()=>{let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode('{"status":0}')}),cancel:jest.fn(),releaseLock:jest.fn()};}}});
 await fireEvent.press(screen.getByRole('button',{name:'Look up barcode'}));
 expect(mockHttp).toHaveBeenCalledTimes(2);
 expect(screen.getByText('Food not found. Enter it manually.')).toBeTruthy();
});

test('denied camera offers system Settings',async()=>{
 const settings=jest.spyOn(Linking,'openSettings').mockResolvedValue();
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 mockRequest.mockResolvedValue({granted:false,canAskAgain:false});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 await fireEvent.press(screen.getByRole('button',{name:'Open camera settings'}));expect(settings).toHaveBeenCalledTimes(1);settings.mockRestore();
});
test('queued scan after cached lookup settles is ignored; nutrients survive save',async()=>{
 const repo=memoryRepository();repo.localSave('barcode:v2',{[code]:{fetchedAt:Date.now(),product:{food:{name:'Synthetic cereal',amount_g:100,energy_kj:418.4,protein_g:1,carbs_g:2,fat_g:1,fiber_g:4,sugar_g:5,sodium_mg:200},servingGrams:50}}});
 await render(<FoodScreen repository={repo}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 mockRequest.mockResolvedValue({granted:true});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 const scan=mockCameraProps.onBarcodeScanned;await act(async()=>{await scan({data:code,type:'ean13'});});
 const get=jest.spyOn(repo,'localGet');await act(async()=>{await scan({data:code,type:'ean13'});});expect(get).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:'Use this food'}));
 expect(screen.getByLabelText('Fiber (g)')).toHaveDisplayValue('2');
 await fireEvent.press(screen.getByRole('button',{name:/Save to/}));
 expect(repo.list('food_entries')[0].data).toMatchObject({fiber_g:2,sugar_g:2.5,sodium_mg:100});
});
test('unmount aborts lookup and prevents cache writes',async()=>{
 const repo=memoryRepository();let signal:AbortSignal;
 mockHttp.mockImplementation((_url,options)=>{signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));});
 const view=await render(<FoodScreen repository={repo}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 await fireEvent.changeText(screen.getByLabelText('Barcode number'),code);await fireEvent.press(screen.getByRole('button',{name:'Look up barcode'}));
 await view.unmount();expect(signal!.aborted).toBe(true);expect(repo.localSnapshot()).toEqual({});
});

test('UPC-E scan requests expanded UPC-A',async()=>{
 mockHttp.mockResolvedValue({status:404,ok:false});
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Scan'}));
 mockRequest.mockResolvedValue({granted:true});await fireEvent.press(screen.getByRole('button',{name:'Open barcode camera'}));
 await act(async()=>{await mockCameraProps.onBarcodeScanned({data:'01234505',type:'upc_e'});});
 expect(mockHttp.mock.calls[0][0]).toContain('/012000003455.json?fields=');
});
