# 平台鋼琴模型的依據（Steinway D274）

`zy-worklet.js` 的 `buildPiano()` 是「平台鋼琴」系列音色（`pno.grand` 等，`zy-patches.js` 裡帶 `piano: {}` 的）
共用的物理參數模型。標準答案是 **Steinway D274 的文獻量測值**；找不到可以公開下載、
又有多種力度的 D274 取樣（愛荷華大學那套是 Model B、網站內建的 Salamander 是 Yamaha C5），
所以每個參數都對到論文裡的數字，再用 `scripts/daw_shots/piano_check.py` 驗。

## 參數與出處

| 參數 | 值 | 出處 |
|---|---|---|
| 不諧和係數 B（`PIANO_B`） | C4 ≈ 3.8e-4；往高音約每八度 ×2.9；低音因纏弦在 C2 附近降到 ≈1.2e-4（U 形） | H. A. Conklin, “Design and tone in the mechanoacoustic piano. Part III: Piano strings and scale design,” JASA 100(3), 1996（Steinway D 實測） |
| 擊弦點 | 低音 1/8，往高音漸短到 ~1/12 | Conklin 1996；Steinway 的 strike line 設計 |
| 槌子接觸時間 | C4：pp ≈ 4 ms、mf ≈ 2 ms、ff ≈ 0.8 ms（≈ v^-0.8），越高音越短 | A. Askenfelt & E. Jansson, “From touch to string vibrations III,” JASA 88(1)/STL-QPSR, 1991 |
| 槌子的非線性（力度越大越亮） | 拐點之後的斜率 q：pp 陡、ff 緩 | D. E. Hall, “Piano string excitation VI: Nonlinear modeling,” JASA 92, 1992；A. Stulov, “Hysteretic model of the grand piano hammer felt,” JASA 97, 1995 |
| 雙段衰減（`PIANO_T60`） | C4：快段 t60 ≈ 2.8 s、慢段 ≈ 18 s；高音縮短、低音延長 | G. Weinreich, “Coupled piano strings,” JASA 62(6), 1977；B. Bank, “Physics-based sound synthesis of the piano,” 碩士論文, Helsinki Univ. of Technology, 2000 |
| 餘音比例 | 起音的 ~6～18%（比起音低 15～25 dB），高音較少 | Weinreich 1977 |
| 每音弦數 | A0–B0：1、C1–F♯2：2、其餘：3 | Steinway D 的設計 |
| 弦間失諧 | ±0.35～0.85 音分 | Weinreich 1977；調音實務 |
| 縱波分音 | 低音（C3 以下）約在 f0 的 14～20 倍 | H. A. Conklin, “Generation of partials due to nonlinear mixing in a stringed instrument,” JASA 105(1), 1999 |
| 共鳴板 | 300 Hz–1 kHz 最有效率、120 Hz 以下輻射差、2.5 kHz 以上漸弱 | N. Giordano, “Sound production by a vibrating piano soundboard,” JASA 104(3), 1998；H. Suzuki, “Vibration and sound radiation of a piano soundboard,” JASA 80(6), 1986 |
| 制音器 | A6（MIDI 93）以上沒有制音器；高分音先被吃掉 | Steinway D 的設計 |

## 驗證

```
python scripts/daw_shots/piano_check.py              # pno.grand
python scripts/daw_shots/piano_check.py pno.upright  # 其他音色（目標範圍仍是 D274 的，會有不符，屬正常）
python scripts/daw_shots/piano_demo.py               # 試聽樂句 → work/piano/demo-pno.grand.wav
```

`piano_check.py` 對 A0、C2、C3、C4、C5、C6 逐項量：B（擬合分音頻率）、快段／慢段 t60
（前 6 個分音加總的能量斜率，加總才不會被三弦的拍音干擾）、ff 比 pp 的第 2～5 分音強多少 dB、
第 8 分音的擊弦點凹口（C4 以下）、放開琴鍵 0.5 秒後掉多少 dB。
2026-11-27：舊版（分音表通用模型）14 項不符，新版 0 項。

C7 以上不量：基音下面只剩 3～4 個分音，B 與衰減都擬合不出可信的值，文獻也沒有細表。

## 已知的限制

- 文獻值是統計範圍，不是某一台琴逐音的頻譜；音色「像不像」最後還是要耳朵判斷。
- 沒有做延音踏板的同情共鳴（其他弦一起響）與琴弦之間的耦合（同時彈的音互相影響）。
- 縱波分音只放了兩個，真琴更多。
