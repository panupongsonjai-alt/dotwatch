import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme'; import type { HistoryRange } from '@/types/history';
const OPTIONS:HistoryRange[]=['1h','6h','24h','7d'];
export function RangeSelector({value,onChange}:{value:HistoryRange;onChange:(v:HistoryRange)=>void}) {return <View style={s.row}>{OPTIONS.map(o=><Pressable key={o} onPress={()=>onChange(o)} style={[s.button,o===value&&s.active]}><Text style={[s.text,o===value&&s.activeText]}>{o}</Text></Pressable>)}</View>}
const s=StyleSheet.create({row:{flexDirection:'row',gap:6},button:{flex:1,minHeight:38,alignItems:'center',justifyContent:'center',borderRadius:10,borderWidth:1,borderColor:theme.colors.border},active:{borderColor:theme.colors.primary,backgroundColor:theme.colors.surfaceRaised},text:{color:theme.colors.textMuted,fontWeight:'700'},activeText:{color:theme.colors.primary}});
