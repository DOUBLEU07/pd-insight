**PART1 WORK A: AUTO DETECT PRPD PLOT FRAME FOR 0–360 CALIBRATION**

\# =========================================================

\# WORK A: AUTO DETECT PRPD PLOT FRAME FOR 0–360 CALIBRATION

\# =========================================================

\# เป้าหมาย:

\# 1) Upload PRPD image จากเครื่อง

\# 2) หา "กรอบสี่เหลี่ยมของกราฟ PRPD" อัตโนมัติ

\# 3) วางเส้น 0° และ 360° ที่ขอบซ้าย/ขวาของกราฟ

\# 4) วางกรอบสีส้มให้ตรงกรอบ plot

\# 5) ถ้าไม่ตรง ขยับ slider หรือปุ่ม ±1 เองได้

\# 6) กด Save Calibration เพื่อบันทึกตำแหน่งไว้ใช้กับงาน Gap time ต่อ

\# =========================================================



from google.colab import files, drive

drive.mount('/content/drive')



import os

import cv2

import numpy as np

import pandas as pd

import matplotlib.pyplot as plt



import ipywidgets as widgets

from IPython.display import display, clear\_output



\# =========================================================

\# SETTINGS

\# =========================================================



RECORD\_ID = "test\_001"



OUTPUT\_CSV = "/content/drive/MyDrive/CMD\_gap\_time\_results/workA\_graph\_calibration.csv"



\# =========================================================

\# UPLOAD IMAGE FROM COMPUTER

\# =========================================================



print("=" \* 80)

print("UPLOAD PRPD IMAGE")

print("=" \* 80)



uploaded = files.upload()



if len(uploaded) == 0:

&#x20;   raise RuntimeError("No file uploaded.")



uploaded\_filename = list(uploaded.keys())\[0]

IMAGE\_PATH = f"/content/{uploaded\_filename}"



print("Uploaded:", uploaded\_filename)



\# =========================================================

\# LOAD IMAGE

\# =========================================================



img\_bgr = cv2.imread(IMAGE\_PATH)



if img\_bgr is None:

&#x20;   raise RuntimeError("Cannot read image. Please upload .jpg, .jpeg, or .png")



img\_rgb = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2RGB)

img\_gray = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2GRAY)



h, w = img\_gray.shape



print("Image size:", w, "x", h)



\# =========================================================

\# AUTO DETECT PRPD PLOT FRAME

\# =========================================================



def detect\_prpd\_plot\_frame(img\_bgr):

&#x20;   """

&#x20;   หาเส้นกรอบสี่เหลี่ยมของ plot PRPD



&#x20;   return:

&#x20;       x\_left, x\_right, y\_top, y\_bottom, status, candidates

&#x20;   """



&#x20;   gray = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2GRAY)



&#x20;   # ลด noise

&#x20;   blur = cv2.GaussianBlur(gray, (3, 3), 0)



&#x20;   # หา edge

&#x20;   edges = cv2.Canny(blur, 50, 150)



&#x20;   # ขยายเส้นให้ติดกันมากขึ้น

&#x20;   kernel = np.ones((3, 3), np.uint8)

&#x20;   edges\_dilated = cv2.dilate(edges, kernel, iterations=1)



&#x20;   # หา contour

&#x20;   contours, \_ = cv2.findContours(

&#x20;       edges\_dilated,

&#x20;       cv2.RETR\_EXTERNAL,

&#x20;       cv2.CHAIN\_APPROX\_SIMPLE

&#x20;   )



&#x20;   candidates = \[]



&#x20;   img\_h, img\_w = gray.shape

&#x20;   img\_area = img\_w \* img\_h



&#x20;   for cnt in contours:

&#x20;       x, y, ww, hh = cv2.boundingRect(cnt)

&#x20;       area = ww \* hh



&#x20;       # เงื่อนไขคร่าว ๆ ของกรอบกราฟ:

&#x20;       # - ต้องใหญ่พอ

&#x20;       # - ไม่ใช่ทั้งภาพ

&#x20;       # - ไม่ใช่ตัวหนังสือเล็ก ๆ

&#x20;       if area < 0.08 \* img\_area:

&#x20;           continue



&#x20;       if area > 0.90 \* img\_area:

&#x20;           continue



&#x20;       if ww < 0.35 \* img\_w:

&#x20;           continue



&#x20;       if hh < 0.25 \* img\_h:

&#x20;           continue



&#x20;       aspect = ww / max(hh, 1)



&#x20;       # PRPD plot มักเป็นกรอบค่อนข้างกว้าง

&#x20;       if aspect < 0.8 or aspect > 2.5:

&#x20;           continue



&#x20;       # ให้คะแนน: ใหญ่ + อยู่กลางภาพ

&#x20;       cx = x + ww / 2

&#x20;       cy = y + hh / 2



&#x20;       center\_score = 1.0 - (

&#x20;           abs(cx - img\_w / 2) / (img\_w / 2) \* 0.5

&#x20;           + abs(cy - img\_h / 2) / (img\_h / 2) \* 0.5

&#x20;       )



&#x20;       score = area \* center\_score



&#x20;       candidates.append({

&#x20;           "x": x,

&#x20;           "y": y,

&#x20;           "w": ww,

&#x20;           "h": hh,

&#x20;           "area": area,

&#x20;           "aspect": aspect,

&#x20;           "score": score

&#x20;       })



&#x20;   if len(candidates) > 0:

&#x20;       best = sorted(candidates, key=lambda d: d\["score"], reverse=True)\[0]



&#x20;       x\_left = best\["x"]

&#x20;       x\_right = best\["x"] + best\["w"]

&#x20;       y\_top = best\["y"]

&#x20;       y\_bottom = best\["y"] + best\["h"]



&#x20;       status = "contour\_detected"



&#x20;       return x\_left, x\_right, y\_top, y\_bottom, status, candidates



&#x20;   # =====================================================

&#x20;   # FALLBACK: ใช้ projection ของเส้นเข้ม

&#x20;   # =====================================================



&#x20;   dark = gray < 120



&#x20;   col\_sum = dark.sum(axis=0)

&#x20;   row\_sum = dark.sum(axis=1)



&#x20;   col\_thr = max(20, int(0.18 \* img\_h))

&#x20;   row\_thr = max(20, int(0.18 \* img\_w))



&#x20;   xs = np.where(col\_sum > col\_thr)\[0]

&#x20;   ys = np.where(row\_sum > row\_thr)\[0]



&#x20;   if len(xs) > 5 and len(ys) > 5:

&#x20;       x\_left = int(xs.min())

&#x20;       x\_right = int(xs.max())

&#x20;       y\_top = int(ys.min())

&#x20;       y\_bottom = int(ys.max())



&#x20;       # กันกรณีจับขอบภาพใหญ่เกินไป

&#x20;       if (x\_right - x\_left) > 0.90 \* img\_w:

&#x20;           x\_left = int(img\_w \* 0.18)

&#x20;           x\_right = int(img\_w \* 0.88)



&#x20;       if (y\_bottom - y\_top) > 0.90 \* img\_h:

&#x20;           y\_top = int(img\_h \* 0.15)

&#x20;           y\_bottom = int(img\_h \* 0.85)



&#x20;       status = "projection\_fallback"

&#x20;       return x\_left, x\_right, y\_top, y\_bottom, status, candidates



&#x20;   # =====================================================

&#x20;   # FINAL FALLBACK: ตั้งค่ากลาง ๆ

&#x20;   # =====================================================



&#x20;   x\_left = int(img\_w \* 0.18)

&#x20;   x\_right = int(img\_w \* 0.88)

&#x20;   y\_top = int(img\_h \* 0.15)

&#x20;   y\_bottom = int(img\_h \* 0.85)



&#x20;   status = "manual\_required"



&#x20;   return x\_left, x\_right, y\_top, y\_bottom, status, candidates





auto\_x\_left, auto\_x\_right, auto\_y\_top, auto\_y\_bottom, auto\_status, candidates = detect\_prpd\_plot\_frame(img\_bgr)



print("\\n" + "=" \* 80)

print("AUTO DETECTION RESULT")

print("=" \* 80)

print("status  :", auto\_status)

print("x\_left  :", auto\_x\_left)

print("x\_right :", auto\_x\_right)

print("y\_top   :", auto\_y\_top)

print("y\_bottom:", auto\_y\_bottom)

print("candidates:", len(candidates))



\# =========================================================

\# PHASE CONVERSION FUNCTIONS

\# =========================================================



def pixel\_to\_phase\_deg(x\_pixel, x\_left, x\_right):

&#x20;   return (x\_pixel - x\_left) / (x\_right - x\_left) \* 360.0





def phase\_deg\_to\_pixel(phase\_deg, x\_left, x\_right):

&#x20;   return x\_left + (phase\_deg / 360.0) \* (x\_right - x\_left)



\# =========================================================

\# INTERACTIVE SLIDERS

\# =========================================================



x\_left\_slider = widgets.IntSlider(

&#x20;   value=auto\_x\_left,

&#x20;   min=0,

&#x20;   max=w-1,

&#x20;   step=1,

&#x20;   description="0 deg",

&#x20;   continuous\_update=False

)



x\_right\_slider = widgets.IntSlider(

&#x20;   value=auto\_x\_right,

&#x20;   min=0,

&#x20;   max=w-1,

&#x20;   step=1,

&#x20;   description="360 deg",

&#x20;   continuous\_update=False

)



y\_top\_slider = widgets.IntSlider(

&#x20;   value=auto\_y\_top,

&#x20;   min=0,

&#x20;   max=h-1,

&#x20;   step=1,

&#x20;   description="Y top",

&#x20;   continuous\_update=False

)



y\_bottom\_slider = widgets.IntSlider(

&#x20;   value=auto\_y\_bottom,

&#x20;   min=0,

&#x20;   max=h-1,

&#x20;   step=1,

&#x20;   description="Y bottom",

&#x20;   continuous\_update=False

)



\# =========================================================

\# FINE ADJUSTMENT BUTTONS

\# =========================================================



\# ปุ่มปรับละเอียด X

x\_left\_minus = widgets.Button(description="0° -1")

x\_left\_plus = widgets.Button(description="0° +1")

x\_right\_minus = widgets.Button(description="360° -1")

x\_right\_plus = widgets.Button(description="360° +1")



\# ปุ่มปรับละเอียด Y

y\_top\_minus = widgets.Button(description="Y top -1")

y\_top\_plus = widgets.Button(description="Y top +1")

y\_bottom\_minus = widgets.Button(description="Y bottom -1")

y\_bottom\_plus = widgets.Button(description="Y bottom +1")



save\_button = widgets.Button(

&#x20;   description="Save Calibration",

&#x20;   button\_style="success"

)



output = widgets.Output()



\# =========================================================

\# DRAW FUNCTION

\# =========================================================



def draw\_calibration():

&#x20;   with output:

&#x20;       clear\_output(wait=True)



&#x20;       x\_left = x\_left\_slider.value

&#x20;       x\_right = x\_right\_slider.value

&#x20;       y\_top = y\_top\_slider.value

&#x20;       y\_bottom = y\_bottom\_slider.value



&#x20;       if x\_right <= x\_left:

&#x20;           print("ERROR: 360 deg must be greater than 0 deg")

&#x20;           return



&#x20;       if y\_bottom <= y\_top:

&#x20;           print("ERROR: Y bottom must be greater than Y top")

&#x20;           return



&#x20;       fig, ax = plt.subplots(figsize=(11, 6))

&#x20;       ax.imshow(img\_rgb)



&#x20;       # กรอบ plot สีส้ม

&#x20;       rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;       rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;       ax.plot(

&#x20;           rect\_x,

&#x20;           rect\_y,

&#x20;           color="orange",

&#x20;           linewidth=2.5,

&#x20;           label="Detected plot frame"

&#x20;       )



&#x20;       # เส้น 0 และ 360

&#x20;       ax.axvline(

&#x20;           x\_left,

&#x20;           color="blue",

&#x20;           linestyle="--",

&#x20;           linewidth=2.0,

&#x20;           label="0 deg"

&#x20;       )



&#x20;       ax.axvline(

&#x20;           x\_right,

&#x20;           color="blue",

&#x20;           linestyle="--",

&#x20;           linewidth=2.0,

&#x20;           label="360 deg"

&#x20;       )



&#x20;       # เส้น phase สำคัญ 90/180/270 เพื่อเช็คสายตา

&#x20;       x\_90 = phase\_deg\_to\_pixel(90, x\_left, x\_right)

&#x20;       x\_180 = phase\_deg\_to\_pixel(180, x\_left, x\_right)

&#x20;       x\_270 = phase\_deg\_to\_pixel(270, x\_left, x\_right)



&#x20;       ax.axvline(

&#x20;           x\_90,

&#x20;           color="gray",

&#x20;           linestyle=":",

&#x20;           linewidth=1.2,

&#x20;           label="90/180/270 deg"

&#x20;       )

&#x20;       ax.axvline(x\_180, color="gray", linestyle=":", linewidth=1.2)

&#x20;       ax.axvline(x\_270, color="gray", linestyle=":", linewidth=1.2)



&#x20;       ax.set\_title(

&#x20;           f"{RECORD\_ID} | Plot frame calibration | status = {auto\_status}"

&#x20;       )

&#x20;       ax.axis("off")

&#x20;       ax.legend(loc="upper right")

&#x20;       plt.show()



&#x20;       print("=" \* 80)

&#x20;       print("CURRENT CALIBRATION")

&#x20;       print("=" \* 80)

&#x20;       print("Record ID       :", RECORD\_ID)

&#x20;       print("Uploaded file   :", uploaded\_filename)

&#x20;       print("Auto status     :", auto\_status)

&#x20;       print("0 deg x\_left    :", x\_left)

&#x20;       print("360 deg x\_right :", x\_right)

&#x20;       print("Y top           :", y\_top)

&#x20;       print("Y bottom        :", y\_bottom)

&#x20;       print("Plot width      :", x\_right - x\_left)

&#x20;       print("Plot height     :", y\_bottom - y\_top)

&#x20;       print("-" \* 80)

&#x20;       print("Check:")

&#x20;       print("0° line should be on left plot border")

&#x20;       print("360° line should be on right plot border")

&#x20;       print("Y top should be on upper plot border")

&#x20;       print("Y bottom should be on lower plot border")

&#x20;       print("90°, 180°, 270° dotted lines should match phase ticks")



\# =========================================================

\# EVENTS

\# =========================================================



def on\_slider\_change(change):

&#x20;   draw\_calibration()





x\_left\_slider.observe(on\_slider\_change, names="value")

x\_right\_slider.observe(on\_slider\_change, names="value")

y\_top\_slider.observe(on\_slider\_change, names="value")

y\_bottom\_slider.observe(on\_slider\_change, names="value")



\# -------------------------

\# X button functions

\# -------------------------



def move\_x\_left\_minus(b):

&#x20;   x\_left\_slider.value = max(0, x\_left\_slider.value - 1)



def move\_x\_left\_plus(b):

&#x20;   x\_left\_slider.value = min(w-1, x\_left\_slider.value + 1)



def move\_x\_right\_minus(b):

&#x20;   x\_right\_slider.value = max(0, x\_right\_slider.value - 1)



def move\_x\_right\_plus(b):

&#x20;   x\_right\_slider.value = min(w-1, x\_right\_slider.value + 1)



\# -------------------------

\# Y button functions

\# -------------------------



def move\_y\_top\_minus(b):

&#x20;   y\_top\_slider.value = max(0, y\_top\_slider.value - 1)



def move\_y\_top\_plus(b):

&#x20;   y\_top\_slider.value = min(h-1, y\_top\_slider.value + 1)



def move\_y\_bottom\_minus(b):

&#x20;   y\_bottom\_slider.value = max(0, y\_bottom\_slider.value - 1)



def move\_y\_bottom\_plus(b):

&#x20;   y\_bottom\_slider.value = min(h-1, y\_bottom\_slider.value + 1)



\# -------------------------

\# connect buttons

\# -------------------------



x\_left\_minus.on\_click(move\_x\_left\_minus)

x\_left\_plus.on\_click(move\_x\_left\_plus)

x\_right\_minus.on\_click(move\_x\_right\_minus)

x\_right\_plus.on\_click(move\_x\_right\_plus)



y\_top\_minus.on\_click(move\_y\_top\_minus)

y\_top\_plus.on\_click(move\_y\_top\_plus)

y\_bottom\_minus.on\_click(move\_y\_bottom\_minus)

y\_bottom\_plus.on\_click(move\_y\_bottom\_plus)



\# =========================================================

\# SAVE CALIBRATION

\# =========================================================



def save\_calibration(row, output\_csv):

&#x20;   os.makedirs(os.path.dirname(output\_csv), exist\_ok=True)



&#x20;   df\_new = pd.DataFrame(\[row])



&#x20;   if os.path.exists(output\_csv):

&#x20;       df\_old = pd.read\_csv(output\_csv)

&#x20;       df\_all = pd.concat(\[df\_old, df\_new], ignore\_index=True)

&#x20;   else:

&#x20;       df\_all = df\_new



&#x20;   df\_all.to\_csv(output\_csv, index=False)

&#x20;   print("Saved:", output\_csv)





def on\_save\_clicked(b):

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   if x\_right <= x\_left or y\_bottom <= y\_top:

&#x20;       with output:

&#x20;           print("ERROR: Invalid calibration. Please check sliders.")

&#x20;       return



&#x20;   # ถ้าขยับจาก auto เกิน 2 pixel ถือว่า manual adjusted

&#x20;   if (

&#x20;       abs(x\_left - auto\_x\_left) > 2 or

&#x20;       abs(x\_right - auto\_x\_right) > 2 or

&#x20;       abs(y\_top - auto\_y\_top) > 2 or

&#x20;       abs(y\_bottom - auto\_y\_bottom) > 2

&#x20;   ):

&#x20;       calibration\_status = "manual\_adjusted"

&#x20;   else:

&#x20;       calibration\_status = "auto\_accepted"



&#x20;   row = {

&#x20;       "record\_id": RECORD\_ID,

&#x20;       "uploaded\_filename": uploaded\_filename,

&#x20;       "image\_path": IMAGE\_PATH,

&#x20;       "image\_width": w,

&#x20;       "image\_height": h,



&#x20;       "x\_left\_0deg": x\_left,

&#x20;       "x\_right\_360deg": x\_right,

&#x20;       "y\_top\_plot": y\_top,

&#x20;       "y\_bottom\_plot": y\_bottom,



&#x20;       "plot\_width\_pixel": x\_right - x\_left,

&#x20;       "plot\_height\_pixel": y\_bottom - y\_top,



&#x20;       "auto\_detection\_status": auto\_status,

&#x20;       "calibration\_status": calibration\_status,

&#x20;       "remark": ""

&#x20;   }



&#x20;   with output:

&#x20;       print("\\n" + "=" \* 80)

&#x20;       print("CALIBRATION SAVED")

&#x20;       print("=" \* 80)

&#x20;       print(row)



&#x20;   save\_calibration(row, OUTPUT\_CSV)





save\_button.on\_click(on\_save\_clicked)



\# =========================================================

\# DISPLAY UI

\# =========================================================



ui = widgets.VBox(\[

&#x20;   widgets.HTML("<h3>WORK A: PRPD Plot Frame Calibration</h3>"),

&#x20;   widgets.HTML(

&#x20;       "<b>Goal:</b> ให้เส้น 0° และ 360° จับขอบซ้าย-ขวาของกรอบกราฟ PRPD ให้ถูกก่อน"

&#x20;   ),



&#x20;   widgets.HTML("<b>X-axis calibration</b>"),

&#x20;   x\_left\_slider,

&#x20;   widgets.HBox(\[x\_left\_minus, x\_left\_plus]),



&#x20;   x\_right\_slider,

&#x20;   widgets.HBox(\[x\_right\_minus, x\_right\_plus]),



&#x20;   widgets.HTML("<b>Y-axis / plot frame calibration</b>"),

&#x20;   y\_top\_slider,

&#x20;   widgets.HBox(\[y\_top\_minus, y\_top\_plus]),



&#x20;   y\_bottom\_slider,

&#x20;   widgets.HBox(\[y\_bottom\_minus, y\_bottom\_plus]),



&#x20;   save\_button,

&#x20;   output

])



display(ui)

draw\_calibration()



**PART2 WORK B / MODEL 4: GAP-TIME MEASUREMENT**

\# =========================================================

\# WORK B / MODEL 4: GAP-TIME MEASUREMENT

\# VERSION: AXIS CALIBRATION SAFETY CHECK + NEW PD SOURCE RULE + CABLE SEVERITY

\# =========================================================

\# Workflow:

\# 1) Upload PRPD image

\# 2) Check image size

\# 3) If image size = 388 x 281 -> allow default calibration

\# 4) If image size != 388 x 281 -> force auto/manual calibration

\# 5) Adjust PRPD axis if needed

\# 6) Re-detect gap lines

\# 7) Adjust gap lines

\# 8) Select PD source type manually OR apply optional confidence rule

\# 9) Evaluate severity from cable gap-time table

\# 10) Save original image, annotated image, per-image CSV, summary CSV

\# =========================================================



from google.colab import drive, files

drive.mount('/content/drive')



import os

import re

import shutil

import cv2

import numpy as np

import pandas as pd

import matplotlib.pyplot as plt



import ipywidgets as widgets

from IPython.display import display, clear\_output



\# =========================================================

\# USER SETTINGS

\# =========================================================



RECORD\_ID = "test\_001"

SAMPLE = "S1"

DEFECT\_TYPE = "unknown"



BASE\_RESULT\_DIR = "/content/drive/MyDrive/CMD\_gap\_time\_results/by\_image"

SUMMARY\_CSV = "/content/drive/MyDrive/CMD\_gap\_time\_results/workB\_gap\_time\_summary.csv"

CALIBRATION\_CSV = "/content/drive/MyDrive/CMD\_gap\_time\_results/calibration\_history.csv"



\# =========================================================

\# DEFAULT CALIBRATION PRESET

\# =========================================================



DEFAULT\_IMAGE\_WIDTH = 388

DEFAULT\_IMAGE\_HEIGHT = 281



DEFAULT\_X\_LEFT = 73

DEFAULT\_X\_RIGHT = 348

DEFAULT\_Y\_TOP = 16

DEFAULT\_Y\_BOTTOM = 233



\# 50 Hz -> 360 degree = 20 ms

CYCLE\_TIME\_MS = 20.0



\# =========================================================

\# UPLOAD PRPD IMAGE

\# =========================================================



print("=" \* 80)

print("UPLOAD PRPD IMAGE")

print("=" \* 80)



uploaded = files.upload()



if len(uploaded) == 0:

&#x20;   raise RuntimeError("No file uploaded.")



uploaded\_filename = list(uploaded.keys())\[0]

IMAGE\_PATH = f"/content/{uploaded\_filename}"



print("Uploaded:", uploaded\_filename)



\# =========================================================

\# LOAD IMAGE

\# =========================================================



img\_bgr = cv2.imread(IMAGE\_PATH)



if img\_bgr is None:

&#x20;   raise RuntimeError("Cannot read image. Please upload .jpg, .jpeg, or .png")



img\_rgb = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2RGB)

img\_gray = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2GRAY)



h, w = img\_gray.shape



print("Image size:", w, "x", h)



DEFAULT\_SIZE\_MATCH = (w == DEFAULT\_IMAGE\_WIDTH and h == DEFAULT\_IMAGE\_HEIGHT)



if DEFAULT\_SIZE\_MATCH:

&#x20;   print("DEFAULT CALIBRATION STATUS: OK")

&#x20;   print("Image size matches PDProcessingII preset 388 x 281.")

else:

&#x20;   print("\\n" + "=" \* 80)

&#x20;   print("WARNING: IMAGE SIZE DOES NOT MATCH DEFAULT CALIBRATION")

&#x20;   print("=" \* 80)

&#x20;   print(f"Current image size : {w} x {h}")

&#x20;   print(f"Default size       : {DEFAULT\_IMAGE\_WIDTH} x {DEFAULT\_IMAGE\_HEIGHT}")

&#x20;   print("Default calibration will NOT be used automatically.")

&#x20;   print("Use auto-detected calibration or manual calibration instead.")



\# =========================================================

\# BASIC FUNCTIONS

\# =========================================================



def safe\_name\_from\_filename(filename):

&#x20;   name = os.path.splitext(os.path.basename(filename))\[0]

&#x20;   name = re.sub(r"\[^\\w\\-]+", "\_", name)

&#x20;   name = re.sub(r"\_+", "\_", name).strip("\_")

&#x20;   return name





def pixel\_to\_phase\_deg(x\_pixel, x\_left, x\_right):

&#x20;   return (x\_pixel - x\_left) / (x\_right - x\_left) \* 360.0





def phase\_deg\_to\_pixel(phase\_deg, x\_left, x\_right):

&#x20;   return x\_left + (phase\_deg / 360.0) \* (x\_right - x\_left)





def gap\_angle\_to\_ms(gap\_angle\_deg):

&#x20;   return gap\_angle\_deg \* CYCLE\_TIME\_MS / 360.0





def gap\_time\_band(gap\_time\_ms):

&#x20;   if gap\_time\_ms is None or np.isnan(gap\_time\_ms):

&#x20;       return "Not measurable"

&#x20;   if gap\_time\_ms > 7:

&#x20;       return "> 7 ms"

&#x20;   elif 4 <= gap\_time\_ms <= 7:

&#x20;       return "4–7 ms"

&#x20;   else:

&#x20;       return "< 4 ms"



\# =========================================================

\# NEW PD SOURCE RULE

\# =========================================================



PD\_SOURCE\_OPTIONS = \[

&#x20;   "Floating / Corona / Bad contact",

&#x20;   "Outside surface discharge",

&#x20;   "Terminations / Joint",

&#x20;   "Internal"

]



def select\_pd\_source\_by\_confidence(corona\_pct, surface\_pct, internal\_pct):

&#x20;   """

&#x20;   New rule for assigning PD source type from AI confidence.

&#x20;   Input values are percentages, e.g. 85.0 = 85%



&#x20;   Priority:

&#x20;   1) Surface > 60% and Internal > 60% -> Terminations / Joint

&#x20;   2) Corona > 80% -> Floating / Corona / Bad contact

&#x20;   3) Surface > 80% -> Outside surface discharge

&#x20;   4) Internal > 80% -> Internal

&#x20;   5) Otherwise -> manual confirmation required

&#x20;   """



&#x20;   corona\_pct = float(corona\_pct)

&#x20;   surface\_pct = float(surface\_pct)

&#x20;   internal\_pct = float(internal\_pct)



&#x20;   if surface\_pct > 60 and internal\_pct > 60:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Joint",

&#x20;           "pd\_source\_type": "Terminations / Joint",

&#x20;           "selection\_rule": "surface\_gt\_60\_and\_internal\_gt\_60"

&#x20;       }



&#x20;   if corona\_pct > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Corona",

&#x20;           "pd\_source\_type": "Floating / Corona / Bad contact",

&#x20;           "selection\_rule": "corona\_gt\_80"

&#x20;       }



&#x20;   if surface\_pct > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Surface",

&#x20;           "pd\_source\_type": "Outside surface discharge",

&#x20;           "selection\_rule": "surface\_gt\_80"

&#x20;       }



&#x20;   if internal\_pct > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Internal",

&#x20;           "pd\_source\_type": "Internal",

&#x20;           "selection\_rule": "internal\_gt\_80"

&#x20;       }



&#x20;   return {

&#x20;       "pd\_rule\_class": "Manual",

&#x20;       "pd\_source\_type": None,

&#x20;       "selection\_rule": "manual\_confirmation\_required"

&#x20;   }



\# =========================================================

\# CABLE GAP-TIME SEVERITY TABLE

\# =========================================================



def severity\_from\_gap\_time\_and\_source(gap\_time\_ms, pd\_source\_type):

&#x20;   if gap\_time\_ms is None or np.isnan(gap\_time\_ms):

&#x20;       return "Not measurable"



&#x20;   if pd\_source\_type in \[

&#x20;       "Floating / Corona / Bad contact",

&#x20;       "Outside surface discharge"

&#x20;   ]:

&#x20;       if gap\_time\_ms > 7:

&#x20;           return "Initial"

&#x20;       elif 4 <= gap\_time\_ms <= 7:

&#x20;           return "Moderate"

&#x20;       else:

&#x20;           return "High"



&#x20;   elif pd\_source\_type in \[

&#x20;       "Terminations / Joint",

&#x20;       "Internal"

&#x20;   ]:

&#x20;       if gap\_time\_ms > 7:

&#x20;           return "Moderate"

&#x20;       elif 4 <= gap\_time\_ms <= 7:

&#x20;           return "High"

&#x20;       else:

&#x20;           return "High"



&#x20;   return "Unknown"



\# =========================================================

\# AUTO DETECT PRPD PLOT FRAME

\# =========================================================



def detect\_prpd\_plot\_frame(img\_bgr):

&#x20;   gray = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2GRAY)



&#x20;   blur = cv2.GaussianBlur(gray, (3, 3), 0)

&#x20;   edges = cv2.Canny(blur, 50, 150)



&#x20;   kernel = np.ones((3, 3), np.uint8)

&#x20;   edges\_dilated = cv2.dilate(edges, kernel, iterations=1)



&#x20;   contours, \_ = cv2.findContours(

&#x20;       edges\_dilated,

&#x20;       cv2.RETR\_EXTERNAL,

&#x20;       cv2.CHAIN\_APPROX\_SIMPLE

&#x20;   )



&#x20;   candidates = \[]

&#x20;   img\_h, img\_w = gray.shape

&#x20;   img\_area = img\_w \* img\_h



&#x20;   for cnt in contours:

&#x20;       x, y, ww, hh = cv2.boundingRect(cnt)

&#x20;       area = ww \* hh



&#x20;       if area < 0.08 \* img\_area:

&#x20;           continue

&#x20;       if area > 0.90 \* img\_area:

&#x20;           continue

&#x20;       if ww < 0.35 \* img\_w:

&#x20;           continue

&#x20;       if hh < 0.25 \* img\_h:

&#x20;           continue



&#x20;       aspect = ww / max(hh, 1)



&#x20;       if aspect < 0.8 or aspect > 2.5:

&#x20;           continue



&#x20;       cx = x + ww / 2

&#x20;       cy = y + hh / 2



&#x20;       center\_score = 1.0 - (

&#x20;           abs(cx - img\_w / 2) / (img\_w / 2) \* 0.5

&#x20;           + abs(cy - img\_h / 2) / (img\_h / 2) \* 0.5

&#x20;       )



&#x20;       score = area \* center\_score



&#x20;       candidates.append({

&#x20;           "x": x,

&#x20;           "y": y,

&#x20;           "w": ww,

&#x20;           "h": hh,

&#x20;           "area": area,

&#x20;           "aspect": aspect,

&#x20;           "score": score

&#x20;       })



&#x20;   if len(candidates) > 0:

&#x20;       best = sorted(candidates, key=lambda d: d\["score"], reverse=True)\[0]



&#x20;       x\_left = best\["x"]

&#x20;       x\_right = best\["x"] + best\["w"]

&#x20;       y\_top = best\["y"]

&#x20;       y\_bottom = best\["y"] + best\["h"]



&#x20;       return x\_left, x\_right, y\_top, y\_bottom, "auto\_contour\_detected"



&#x20;   return (

&#x20;       int(img\_w \* 0.18),

&#x20;       int(img\_w \* 0.88),

&#x20;       int(img\_h \* 0.15),

&#x20;       int(img\_h \* 0.85),

&#x20;       "auto\_failed\_manual\_required"

&#x20;   )



auto\_x\_left, auto\_x\_right, auto\_y\_top, auto\_y\_bottom, auto\_calibration\_status = detect\_prpd\_plot\_frame(img\_bgr)



\# =========================================================

\# MASK CLEANING + AUTO GAP LINE DETECTION

\# =========================================================



def clean\_binary\_mask(binary\_mask, min\_area=2, max\_area=None):

&#x20;   m = (binary\_mask.astype(np.uint8) \* 255)

&#x20;   m = cv2.medianBlur(m, 3)



&#x20;   num\_labels, labels, stats, \_ = cv2.connectedComponentsWithStats(

&#x20;       m,

&#x20;       connectivity=8

&#x20;   )



&#x20;   clean = np.zeros\_like(m)



&#x20;   if max\_area is None:

&#x20;       max\_area = m.shape\[0] \* m.shape\[1]



&#x20;   for i in range(1, num\_labels):

&#x20;       area = stats\[i, cv2.CC\_STAT\_AREA]

&#x20;       if min\_area <= area <= max\_area:

&#x20;           clean\[labels == i] = 255



&#x20;   return clean > 0





def auto\_detect\_gap\_lines(img\_rgb, x\_left, x\_right, y\_top, y\_bottom):

&#x20;   crop = img\_rgb\[y\_top:y\_bottom, x\_left:x\_right].copy()



&#x20;   if crop.size == 0:

&#x20;       return None, "empty\_crop"



&#x20;   crop\_h, crop\_w, \_ = crop.shape



&#x20;   hsv = cv2.cvtColor(crop, cv2.COLOR\_RGB2HSV)

&#x20;   gray = cv2.cvtColor(crop, cv2.COLOR\_RGB2GRAY)



&#x20;   dark\_mask = gray < 165

&#x20;   color\_mask = (hsv\[:, :, 1] > 35) \& (hsv\[:, :, 2] < 250)



&#x20;   mask = dark\_mask | color\_mask



&#x20;   border\_x = max(3, int(0.02 \* crop\_w))

&#x20;   border\_y = max(3, int(0.02 \* crop\_h))



&#x20;   mask\[:, :border\_x] = False

&#x20;   mask\[:, -border\_x:] = False

&#x20;   mask\[:border\_y, :] = False

&#x20;   mask\[-border\_y:, :] = False



&#x20;   y\_mid = crop\_h // 2

&#x20;   axis\_band = max(3, int(0.025 \* crop\_h))



&#x20;   mask\[max(0, y\_mid-axis\_band):min(crop\_h, y\_mid+axis\_band+1), :] = False



&#x20;   positive\_mask = np.zeros\_like(mask)

&#x20;   negative\_mask = np.zeros\_like(mask)



&#x20;   positive\_mask\[:y\_mid-axis\_band, :] = mask\[:y\_mid-axis\_band, :]

&#x20;   negative\_mask\[y\_mid+axis\_band:, :] = mask\[y\_mid+axis\_band:, :]



&#x20;   max\_component\_area = int(0.30 \* crop\_w \* crop\_h)



&#x20;   positive\_mask = clean\_binary\_mask(

&#x20;       positive\_mask,

&#x20;       min\_area=2,

&#x20;       max\_area=max\_component\_area

&#x20;   )



&#x20;   negative\_mask = clean\_binary\_mask(

&#x20;       negative\_mask,

&#x20;       min\_area=2,

&#x20;       max\_area=max\_component\_area

&#x20;   )



&#x20;   pos\_y, pos\_x = np.where(positive\_mask)

&#x20;   neg\_y, neg\_x = np.where(negative\_mask)



&#x20;   if len(pos\_x) < 10 or len(neg\_x) < 10:

&#x20;       return None, "positive\_or\_negative\_cluster\_missing"



&#x20;   pos\_left = int(np.percentile(pos\_x, 5))

&#x20;   pos\_right = int(np.percentile(pos\_x, 95))



&#x20;   neg\_left = int(np.percentile(neg\_x, 5))

&#x20;   neg\_right = int(np.percentile(neg\_x, 95))



&#x20;   if neg\_right < pos\_left:

&#x20;       left\_line\_crop\_x = neg\_right

&#x20;       right\_line\_crop\_x = pos\_left

&#x20;       detected\_case = "negative\_left\_positive\_right"



&#x20;   elif pos\_right < neg\_left:

&#x20;       left\_line\_crop\_x = pos\_right

&#x20;       right\_line\_crop\_x = neg\_left

&#x20;       detected\_case = "positive\_left\_negative\_right"



&#x20;   else:

&#x20;       return None, "clusters\_overlap\_or\_unclear"



&#x20;   gap\_width = right\_line\_crop\_x - left\_line\_crop\_x



&#x20;   if gap\_width < 3:

&#x20;       return None, "gap\_too\_small\_or\_invalid"



&#x20;   left\_line\_x = x\_left + int(left\_line\_crop\_x)

&#x20;   right\_line\_x = x\_left + int(right\_line\_crop\_x)



&#x20;   return {

&#x20;       "left\_line\_x": left\_line\_x,

&#x20;       "right\_line\_x": right\_line\_x,

&#x20;       "positive\_x\_range\_pixel": (x\_left + pos\_left, x\_left + pos\_right),

&#x20;       "negative\_x\_range\_pixel": (x\_left + neg\_left, x\_left + neg\_right),

&#x20;       "positive\_x\_range\_phase": (

&#x20;           pixel\_to\_phase\_deg(x\_left + pos\_left, x\_left, x\_right),

&#x20;           pixel\_to\_phase\_deg(x\_left + pos\_right, x\_left, x\_right)

&#x20;       ),

&#x20;       "negative\_x\_range\_phase": (

&#x20;           pixel\_to\_phase\_deg(x\_left + neg\_left, x\_left, x\_right),

&#x20;           pixel\_to\_phase\_deg(x\_left + neg\_right, x\_left, x\_right)

&#x20;       ),

&#x20;       "gap\_width\_pixel": gap\_width,

&#x20;       "detected\_case": detected\_case,

&#x20;       "pos\_points": len(pos\_x),

&#x20;       "neg\_points": len(neg\_x),

&#x20;   }, "auto\_detected\_positive\_negative"



\# =========================================================

\# INITIAL CALIBRATION VALUES

\# =========================================================



if DEFAULT\_SIZE\_MATCH:

&#x20;   init\_x\_left = DEFAULT\_X\_LEFT

&#x20;   init\_x\_right = DEFAULT\_X\_RIGHT

&#x20;   init\_y\_top = DEFAULT\_Y\_TOP

&#x20;   init\_y\_bottom = DEFAULT\_Y\_BOTTOM

&#x20;   init\_calibration\_mode = "Use default PDProcessingII calibration"

else:

&#x20;   init\_x\_left = auto\_x\_left

&#x20;   init\_x\_right = auto\_x\_right

&#x20;   init\_y\_top = auto\_y\_top

&#x20;   init\_y\_bottom = auto\_y\_bottom

&#x20;   init\_calibration\_mode = "Use auto-detected calibration"



\# =========================================================

\# WIDGETS

\# =========================================================



calibration\_mode\_dropdown = widgets.Dropdown(

&#x20;   options=\[

&#x20;       "Use default PDProcessingII calibration",

&#x20;       "Use auto-detected calibration",

&#x20;       "Manual calibration"

&#x20;   ],

&#x20;   value=init\_calibration\_mode,

&#x20;   description="Calibration mode",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="560px")

)



x\_left\_slider = widgets.IntSlider(

&#x20;   value=init\_x\_left,

&#x20;   min=0,

&#x20;   max=w-1,

&#x20;   step=1,

&#x20;   description="0 deg",

&#x20;   continuous\_update=False

)



x\_right\_slider = widgets.IntSlider(

&#x20;   value=init\_x\_right,

&#x20;   min=0,

&#x20;   max=w-1,

&#x20;   step=1,

&#x20;   description="360 deg",

&#x20;   continuous\_update=False

)



y\_top\_slider = widgets.IntSlider(

&#x20;   value=init\_y\_top,

&#x20;   min=0,

&#x20;   max=h-1,

&#x20;   step=1,

&#x20;   description="Y top",

&#x20;   continuous\_update=False

)



y\_bottom\_slider = widgets.IntSlider(

&#x20;   value=init\_y\_bottom,

&#x20;   min=0,

&#x20;   max=h-1,

&#x20;   step=1,

&#x20;   description="Y bottom",

&#x20;   continuous\_update=False

)



left\_line\_slider = widgets.IntSlider(

&#x20;   value=int((init\_x\_left + init\_x\_right) \* 0.45),

&#x20;   min=0,

&#x20;   max=w-1,

&#x20;   step=1,

&#x20;   description="Left line",

&#x20;   continuous\_update=False

)



right\_line\_slider = widgets.IntSlider(

&#x20;   value=int((init\_x\_left + init\_x\_right) \* 0.55),

&#x20;   min=0,

&#x20;   max=w-1,

&#x20;   step=1,

&#x20;   description="Right line",

&#x20;   continuous\_update=False

)



pd\_source\_dropdown = widgets.Dropdown(

&#x20;   options=PD\_SOURCE\_OPTIONS,

&#x20;   value="Outside surface discharge",

&#x20;   description="PD source",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="560px")

)



\# Optional AI percentage inputs for applying new rule manually in Part B

corona\_pct\_input = widgets.FloatText(

&#x20;   value=0.0,

&#x20;   description="Corona %",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="180px")

)



surface\_pct\_input = widgets.FloatText(

&#x20;   value=0.0,

&#x20;   description="Surface %",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="180px")

)



internal\_pct\_input = widgets.FloatText(

&#x20;   value=0.0,

&#x20;   description="Internal %",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="180px")

)



apply\_pd\_rule\_button = widgets.Button(

&#x20;   description="Apply PD Source Rule",

&#x20;   button\_style="info"

)



pd\_rule\_output = widgets.Output()



warning\_html = widgets.HTML("")



\# Calibration buttons

x\_left\_minus = widgets.Button(description="0° -1")

x\_left\_plus = widgets.Button(description="0° +1")

x\_right\_minus = widgets.Button(description="360° -1")

x\_right\_plus = widgets.Button(description="360° +1")



y\_top\_minus = widgets.Button(description="Y top -1")

y\_top\_plus = widgets.Button(description="Y top +1")

y\_bottom\_minus = widgets.Button(description="Y bottom -1")

y\_bottom\_plus = widgets.Button(description="Y bottom +1")



\# Gap buttons

left\_minus = widgets.Button(description="Left -1")

left\_plus = widgets.Button(description="Left +1")

right\_minus = widgets.Button(description="Right -1")

right\_plus = widgets.Button(description="Right +1")



redetect\_gap\_button = widgets.Button(

&#x20;   description="Re-detect Gap Lines",

&#x20;   button\_style="info"

)



save\_calibration\_button = widgets.Button(

&#x20;   description="Save Calibration Only",

&#x20;   button\_style=""

)



accept\_button = widgets.Button(

&#x20;   description="Accept and Save",

&#x20;   button\_style="success"

)



not\_measurable\_button = widgets.Button(

&#x20;   description="Not Measurable",

&#x20;   button\_style="warning"

)



output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       height="650px",

&#x20;       overflow\_y="auto",

&#x20;       border="1px solid #444",

&#x20;       padding="4px"

&#x20;   )

)



auto\_result = None

auto\_detection\_status = "not\_detected\_yet"

latest\_pd\_rule\_class = "Manual"

latest\_pd\_selection\_rule = "manual\_selected"



\# =========================================================

\# WARNING DISPLAY

\# =========================================================



def update\_warning\_box():

&#x20;   if DEFAULT\_SIZE\_MATCH:

&#x20;       warning\_html.value = (

&#x20;           "<div style='padding:8px; border:1px solid #2e7d32; color:#2e7d32;'>"

&#x20;           "<b>Calibration check:</b> Image size matches default preset 388×281. "

&#x20;           "Default calibration is allowed."

&#x20;           "</div>"

&#x20;       )

&#x20;   else:

&#x20;       warning\_html.value = (

&#x20;           "<div style='padding:8px; border:1px solid #c62828; color:#c62828;'>"

&#x20;           "<b>Calibration warning:</b> Image size does not match default preset 388×281. "

&#x20;           "Default calibration is blocked. Use auto-detected or manual calibration."

&#x20;           "</div>"

&#x20;       )



update\_warning\_box()



\# =========================================================

\# APPLY PD SOURCE RULE

\# =========================================================



def on\_apply\_pd\_rule\_clicked(b):

&#x20;   global latest\_pd\_rule\_class, latest\_pd\_selection\_rule



&#x20;   result = select\_pd\_source\_by\_confidence(

&#x20;       corona\_pct\_input.value,

&#x20;       surface\_pct\_input.value,

&#x20;       internal\_pct\_input.value

&#x20;   )



&#x20;   latest\_pd\_rule\_class = result\["pd\_rule\_class"]

&#x20;   latest\_pd\_selection\_rule = result\["selection\_rule"]



&#x20;   with pd\_rule\_output:

&#x20;       clear\_output(wait=True)

&#x20;       print("=" \* 80)

&#x20;       print("PD SOURCE RULE RESULT")

&#x20;       print("=" \* 80)

&#x20;       print("Corona % :", corona\_pct\_input.value)

&#x20;       print("Surface %:", surface\_pct\_input.value)

&#x20;       print("Internal %:", internal\_pct\_input.value)

&#x20;       print("Rule class:", result\["pd\_rule\_class"])

&#x20;       print("Rule:", result\["selection\_rule"])



&#x20;       if result\["pd\_source\_type"] is None:

&#x20;           print("Result: Manual confirmation required. Dropdown was not changed.")

&#x20;       else:

&#x20;           pd\_source\_dropdown.value = result\["pd\_source\_type"]

&#x20;           print("Selected PD source:", result\["pd\_source\_type"])



&#x20;   draw\_all()



apply\_pd\_rule\_button.on\_click(on\_apply\_pd\_rule\_clicked)



\# =========================================================

\# APPLY CALIBRATION MODE WITH SAFETY CHECK

\# =========================================================



def apply\_calibration\_mode(change=None):

&#x20;   mode = calibration\_mode\_dropdown.value



&#x20;   if mode == "Use default PDProcessingII calibration":

&#x20;       if not DEFAULT\_SIZE\_MATCH:

&#x20;           with output:

&#x20;               clear\_output(wait=True)

&#x20;               print("=" \* 80)

&#x20;               print("WARNING: DEFAULT CALIBRATION BLOCKED")

&#x20;               print("=" \* 80)

&#x20;               print(f"Current image size : {w} x {h}")

&#x20;               print(f"Default size       : {DEFAULT\_IMAGE\_WIDTH} x {DEFAULT\_IMAGE\_HEIGHT}")

&#x20;               print("Switching to auto-detected calibration.")



&#x20;           calibration\_mode\_dropdown.value = "Use auto-detected calibration"

&#x20;           return



&#x20;       x\_left\_slider.value = DEFAULT\_X\_LEFT

&#x20;       x\_right\_slider.value = DEFAULT\_X\_RIGHT

&#x20;       y\_top\_slider.value = DEFAULT\_Y\_TOP

&#x20;       y\_bottom\_slider.value = DEFAULT\_Y\_BOTTOM



&#x20;   elif mode == "Use auto-detected calibration":

&#x20;       x\_left\_slider.value = min(max(auto\_x\_left, 0), w-1)

&#x20;       x\_right\_slider.value = min(max(auto\_x\_right, 0), w-1)

&#x20;       y\_top\_slider.value = min(max(auto\_y\_top, 0), h-1)

&#x20;       y\_bottom\_slider.value = min(max(auto\_y\_bottom, 0), h-1)



&#x20;   elif mode == "Manual calibration":

&#x20;       pass



&#x20;   draw\_all()



calibration\_mode\_dropdown.observe(apply\_calibration\_mode, names="value")



\# =========================================================

\# DRAW FUNCTION

\# =========================================================



def draw\_all():

&#x20;   with output:

&#x20;       clear\_output(wait=True)



&#x20;       x\_left = x\_left\_slider.value

&#x20;       x\_right = x\_right\_slider.value

&#x20;       y\_top = y\_top\_slider.value

&#x20;       y\_bottom = y\_bottom\_slider.value



&#x20;       left\_x = left\_line\_slider.value

&#x20;       right\_x = right\_line\_slider.value

&#x20;       pd\_source\_type = pd\_source\_dropdown.value



&#x20;       if x\_right <= x\_left:

&#x20;           print("ERROR: 360 deg must be greater than 0 deg")

&#x20;           return



&#x20;       if y\_bottom <= y\_top:

&#x20;           print("ERROR: Y bottom must be greater than Y top")

&#x20;           return



&#x20;       left\_phase = pixel\_to\_phase\_deg(left\_x, x\_left, x\_right)

&#x20;       right\_phase = pixel\_to\_phase\_deg(right\_x, x\_left, x\_right)



&#x20;       gap\_angle = right\_phase - left\_phase



&#x20;       if gap\_angle <= 0:

&#x20;           gap\_time\_ms = np.nan

&#x20;           gap\_band = "Invalid"

&#x20;           severity = "Invalid lines"

&#x20;       else:

&#x20;           gap\_time\_ms = gap\_angle\_to\_ms(gap\_angle)

&#x20;           gap\_band = gap\_time\_band(gap\_time\_ms)

&#x20;           severity = severity\_from\_gap\_time\_and\_source(gap\_time\_ms, pd\_source\_type)



&#x20;       fig, ax = plt.subplots(figsize=(8.5, 4.6))

&#x20;       ax.imshow(img\_rgb)



&#x20;       rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;       rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;       ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Current plot frame")



&#x20;       ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.6, label="0 deg")

&#x20;       ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.6, label="360 deg")



&#x20;       ax.axvline(phase\_deg\_to\_pixel(90, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.1, label="90/180/270 deg")

&#x20;       ax.axvline(phase\_deg\_to\_pixel(180, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.1)

&#x20;       ax.axvline(phase\_deg\_to\_pixel(270, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.1)



&#x20;       if auto\_result is not None:

&#x20;           pos\_l, pos\_r = auto\_result\["positive\_x\_range\_pixel"]

&#x20;           neg\_l, neg\_r = auto\_result\["negative\_x\_range\_pixel"]



&#x20;           ax.axvspan(pos\_l, pos\_r, color="yellow", alpha=0.12, label="positive cluster range")

&#x20;           ax.axvspan(neg\_l, neg\_r, color="cyan", alpha=0.12, label="negative cluster range")



&#x20;       ax.axvline(left\_x, color="red", linewidth=2.4, label="Left gap line")

&#x20;       ax.axvline(right\_x, color="green", linewidth=2.4, label="Right gap line")



&#x20;       ax.set\_title(

&#x20;           f"{RECORD\_ID} | PD source: {pd\_source\_type}\\n"

&#x20;           f"Gap angle = {gap\_angle:.2f} deg | Gap time = {gap\_time\_ms:.2f} ms | "

&#x20;           f"Band = {gap\_band} | Severity = {severity}",

&#x20;           fontsize=10

&#x20;       )



&#x20;       ax.axis("off")

&#x20;       ax.legend(loc="upper right", fontsize=8)

&#x20;       plt.tight\_layout()

&#x20;       plt.show()



&#x20;       print("=" \* 80)

&#x20;       print("CURRENT RESULT")

&#x20;       print("=" \* 80)

&#x20;       print("Uploaded file     :", uploaded\_filename)

&#x20;       print("Image size        :", f"{w} x {h}")

&#x20;       print("Calibration mode  :", calibration\_mode\_dropdown.value)

&#x20;       print("PD source type    :", pd\_source\_type)

&#x20;       print("PD rule class     :", latest\_pd\_rule\_class)

&#x20;       print("PD selection rule :", latest\_pd\_selection\_rule)

&#x20;       print("-" \* 80)

&#x20;       print("Left line pixel   :", left\_x)

&#x20;       print("Right line pixel  :", right\_x)

&#x20;       print("Left phase        :", f"{left\_phase:.2f} degree")

&#x20;       print("Right phase       :", f"{right\_phase:.2f} degree")

&#x20;       print("Gap angle         :", f"{gap\_angle:.2f} degree")

&#x20;       print("Gap time          :", f"{gap\_time\_ms:.2f} ms")

&#x20;       print("Gap band          :", gap\_band)

&#x20;       print("Severity          :", severity)

&#x20;       print("Auto gap status   :", auto\_detection\_status)



&#x20;       if auto\_result is not None:

&#x20;           print("-" \* 80)

&#x20;           print("Detected case     :", auto\_result\["detected\_case"])



\# =========================================================

\# EVENTS: SLIDERS

\# =========================================================



def on\_any\_change(change=None):

&#x20;   draw\_all()



for s in \[

&#x20;   x\_left\_slider,

&#x20;   x\_right\_slider,

&#x20;   y\_top\_slider,

&#x20;   y\_bottom\_slider,

&#x20;   left\_line\_slider,

&#x20;   right\_line\_slider,

&#x20;   pd\_source\_dropdown

]:

&#x20;   s.observe(on\_any\_change, names="value")



\# =========================================================

\# EVENTS: BUTTONS

\# =========================================================



def move\_x\_left\_minus(b):

&#x20;   x\_left\_slider.value = max(0, x\_left\_slider.value - 1)



def move\_x\_left\_plus(b):

&#x20;   x\_left\_slider.value = min(w-1, x\_left\_slider.value + 1)



def move\_x\_right\_minus(b):

&#x20;   x\_right\_slider.value = max(0, x\_right\_slider.value - 1)



def move\_x\_right\_plus(b):

&#x20;   x\_right\_slider.value = min(w-1, x\_right\_slider.value + 1)



def move\_y\_top\_minus(b):

&#x20;   y\_top\_slider.value = max(0, y\_top\_slider.value - 1)



def move\_y\_top\_plus(b):

&#x20;   y\_top\_slider.value = min(h-1, y\_top\_slider.value + 1)



def move\_y\_bottom\_minus(b):

&#x20;   y\_bottom\_slider.value = max(0, y\_bottom\_slider.value - 1)



def move\_y\_bottom\_plus(b):

&#x20;   y\_bottom\_slider.value = min(h-1, y\_bottom\_slider.value + 1)



def move\_left\_minus(b):

&#x20;   left\_line\_slider.value = max(0, left\_line\_slider.value - 1)



def move\_left\_plus(b):

&#x20;   left\_line\_slider.value = min(w-1, left\_line\_slider.value + 1)



def move\_right\_minus(b):

&#x20;   right\_line\_slider.value = max(0, right\_line\_slider.value - 1)



def move\_right\_plus(b):

&#x20;   right\_line\_slider.value = min(w-1, right\_line\_slider.value + 1)



x\_left\_minus.on\_click(move\_x\_left\_minus)

x\_left\_plus.on\_click(move\_x\_left\_plus)

x\_right\_minus.on\_click(move\_x\_right\_minus)

x\_right\_plus.on\_click(move\_x\_right\_plus)



y\_top\_minus.on\_click(move\_y\_top\_minus)

y\_top\_plus.on\_click(move\_y\_top\_plus)

y\_bottom\_minus.on\_click(move\_y\_bottom\_minus)

y\_bottom\_plus.on\_click(move\_y\_bottom\_plus)



left\_minus.on\_click(move\_left\_minus)

left\_plus.on\_click(move\_left\_plus)

right\_minus.on\_click(move\_right\_minus)

right\_plus.on\_click(move\_right\_plus)



\# =========================================================

\# RE-DETECT GAP LINES

\# =========================================================



def redetect\_gap\_lines(b=None):

&#x20;   global auto\_result, auto\_detection\_status



&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   if x\_right <= x\_left or y\_bottom <= y\_top:

&#x20;       with output:

&#x20;           print("ERROR: Invalid calibration. Cannot re-detect gap lines.")

&#x20;       return



&#x20;   auto\_result, auto\_detection\_status = auto\_detect\_gap\_lines(

&#x20;       img\_rgb,

&#x20;       x\_left,

&#x20;       x\_right,

&#x20;       y\_top,

&#x20;       y\_bottom

&#x20;   )



&#x20;   if auto\_result is None:

&#x20;       left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;       right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))

&#x20;   else:

&#x20;       left\_line\_slider.value = auto\_result\["left\_line\_x"]

&#x20;       right\_line\_slider.value = auto\_result\["right\_line\_x"]



&#x20;   draw\_all()



redetect\_gap\_button.on\_click(redetect\_gap\_lines)



\# =========================================================

\# SAVE CALIBRATION ONLY

\# =========================================================



def save\_calibration\_only(b=None):

&#x20;   row = {

&#x20;       "record\_id": RECORD\_ID,

&#x20;       "uploaded\_filename": uploaded\_filename,

&#x20;       "image\_width": w,

&#x20;       "image\_height": h,

&#x20;       "default\_size\_match": DEFAULT\_SIZE\_MATCH,

&#x20;       "calibration\_mode": calibration\_mode\_dropdown.value,

&#x20;       "auto\_calibration\_status": auto\_calibration\_status,

&#x20;       "x\_left\_0deg": x\_left\_slider.value,

&#x20;       "x\_right\_360deg": x\_right\_slider.value,

&#x20;       "y\_top\_plot": y\_top\_slider.value,

&#x20;       "y\_bottom\_plot": y\_bottom\_slider.value,

&#x20;       "remark": ""

&#x20;   }



&#x20;   os.makedirs(os.path.dirname(CALIBRATION\_CSV), exist\_ok=True)



&#x20;   df\_new = pd.DataFrame(\[row])



&#x20;   if os.path.exists(CALIBRATION\_CSV):

&#x20;       df\_old = pd.read\_csv(CALIBRATION\_CSV)

&#x20;       df\_all = pd.concat(\[df\_old, df\_new], ignore\_index=True)

&#x20;   else:

&#x20;       df\_all = df\_new



&#x20;   df\_all.to\_csv(CALIBRATION\_CSV, index=False)



&#x20;   with output:

&#x20;       print("\\n" + "=" \* 80)

&#x20;       print("CALIBRATION SAVED")

&#x20;       print("=" \* 80)

&#x20;       print("Saved:", CALIBRATION\_CSV)



save\_calibration\_button.on\_click(save\_calibration\_only)



\# =========================================================

\# SAVE IMAGES + CSV

\# =========================================================



def save\_annotated\_image(output\_path, left\_x, right\_x, gap\_angle, gap\_time\_ms, pd\_source\_type, severity):

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   fig, ax = plt.subplots(figsize=(11, 6))

&#x20;   ax.imshow(img\_rgb)



&#x20;   rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;   rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;   ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Current plot frame")



&#x20;   ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.8, label="0 deg")

&#x20;   ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.8, label="360 deg")



&#x20;   ax.axvline(phase\_deg\_to\_pixel(90, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.2, label="90/180/270 deg")

&#x20;   ax.axvline(phase\_deg\_to\_pixel(180, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.2)

&#x20;   ax.axvline(phase\_deg\_to\_pixel(270, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.2)



&#x20;   if auto\_result is not None:

&#x20;       pos\_l, pos\_r = auto\_result\["positive\_x\_range\_pixel"]

&#x20;       neg\_l, neg\_r = auto\_result\["negative\_x\_range\_pixel"]



&#x20;       ax.axvspan(pos\_l, pos\_r, color="yellow", alpha=0.12, label="positive cluster range")

&#x20;       ax.axvspan(neg\_l, neg\_r, color="cyan", alpha=0.12, label="negative cluster range")



&#x20;   ax.axvline(left\_x, color="red", linewidth=2.5, label="Left gap line")

&#x20;   ax.axvline(right\_x, color="green", linewidth=2.5, label="Right gap line")



&#x20;   ax.set\_title(

&#x20;       f"{RECORD\_ID} | {uploaded\_filename}\\n"

&#x20;       f"PD source: {pd\_source\_type}\\n"

&#x20;       f"Gap angle = {gap\_angle:.2f} deg | Gap time = {gap\_time\_ms:.2f} ms | Severity = {severity}"

&#x20;   )



&#x20;   ax.axis("off")

&#x20;   ax.legend(loc="upper right")



&#x20;   os.makedirs(os.path.dirname(output\_path), exist\_ok=True)

&#x20;   plt.savefig(output\_path, dpi=300, bbox\_inches="tight")

&#x20;   plt.close(fig)





def save\_not\_measurable\_image(output\_path, pd\_source\_type):

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   fig, ax = plt.subplots(figsize=(11, 6))

&#x20;   ax.imshow(img\_rgb)



&#x20;   rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;   rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;   ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Current plot frame")



&#x20;   ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.8, label="0 deg")

&#x20;   ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.8, label="360 deg")



&#x20;   ax.set\_title(

&#x20;       f"{RECORD\_ID} | {uploaded\_filename}\\n"

&#x20;       f"PD source: {pd\_source\_type}\\n"

&#x20;       f"Gap time: Not measurable"

&#x20;   )



&#x20;   ax.axis("off")

&#x20;   ax.legend(loc="upper right")



&#x20;   os.makedirs(os.path.dirname(output\_path), exist\_ok=True)

&#x20;   plt.savefig(output\_path, dpi=300, bbox\_inches="tight")

&#x20;   plt.close(fig)





def save\_result\_by\_image(row, not\_measurable=False):

&#x20;   image\_safe\_name = safe\_name\_from\_filename(uploaded\_filename)



&#x20;   image\_folder = os.path.join(BASE\_RESULT\_DIR, image\_safe\_name)

&#x20;   os.makedirs(image\_folder, exist\_ok=True)



&#x20;   original\_ext = os.path.splitext(uploaded\_filename)\[1].lower()

&#x20;   if original\_ext == "":

&#x20;       original\_ext = ".jpg"



&#x20;   original\_save\_path = os.path.join(image\_folder, f"{image\_safe\_name}\_original{original\_ext}")

&#x20;   annotated\_save\_path = os.path.join(image\_folder, f"{image\_safe\_name}\_annotated.png")

&#x20;   per\_image\_csv\_path = os.path.join(image\_folder, f"{image\_safe\_name}\_gap\_result.csv")



&#x20;   shutil.copy2(IMAGE\_PATH, original\_save\_path)



&#x20;   if not\_measurable:

&#x20;       save\_not\_measurable\_image(

&#x20;           output\_path=annotated\_save\_path,

&#x20;           pd\_source\_type=row\["pd\_source\_type"]

&#x20;       )

&#x20;   else:

&#x20;       save\_annotated\_image(

&#x20;           output\_path=annotated\_save\_path,

&#x20;           left\_x=row\["left\_line\_pixel"],

&#x20;           right\_x=row\["right\_line\_pixel"],

&#x20;           gap\_angle=row\["gap\_angle\_deg"],

&#x20;           gap\_time\_ms=row\["gap\_time\_ms"],

&#x20;           pd\_source\_type=row\["pd\_source\_type"],

&#x20;           severity=row\["severity\_by\_gap\_time"]

&#x20;       )



&#x20;   row\["image\_result\_folder"] = image\_folder

&#x20;   row\["original\_image\_saved\_path"] = original\_save\_path

&#x20;   row\["annotated\_image\_path"] = annotated\_save\_path

&#x20;   row\["per\_image\_csv\_path"] = per\_image\_csv\_path



&#x20;   pd.DataFrame(\[row]).to\_csv(per\_image\_csv\_path, index=False)



&#x20;   df\_new = pd.DataFrame(\[row])



&#x20;   if os.path.exists(SUMMARY\_CSV):

&#x20;       df\_old = pd.read\_csv(SUMMARY\_CSV)



&#x20;       if "uploaded\_filename" in df\_old.columns:

&#x20;           df\_old = df\_old\[df\_old\["uploaded\_filename"] != uploaded\_filename]



&#x20;       df\_all = pd.concat(\[df\_old, df\_new], ignore\_index=True)

&#x20;   else:

&#x20;       df\_all = df\_new



&#x20;   os.makedirs(os.path.dirname(SUMMARY\_CSV), exist\_ok=True)

&#x20;   df\_all.to\_csv(SUMMARY\_CSV, index=False)



&#x20;   with output:

&#x20;       print("\\n" + "=" \* 80)

&#x20;       print("SAVED RESULT")

&#x20;       print("=" \* 80)

&#x20;       print("Saved folder:", image\_folder)

&#x20;       print("Saved original image:", original\_save\_path)

&#x20;       print("Saved annotated image:", annotated\_save\_path)

&#x20;       print("Saved per-image CSV:", per\_image\_csv\_path)

&#x20;       print("Updated summary CSV:", SUMMARY\_CSV)



\# =========================================================

\# ACCEPT / NOT MEASURABLE

\# =========================================================



def on\_accept\_clicked(b):

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   left\_x = left\_line\_slider.value

&#x20;   right\_x = right\_line\_slider.value

&#x20;   pd\_source\_type = pd\_source\_dropdown.value



&#x20;   if x\_right <= x\_left or y\_bottom <= y\_top:

&#x20;       with output:

&#x20;           print("ERROR: Invalid calibration. Cannot save.")

&#x20;       return



&#x20;   left\_phase = pixel\_to\_phase\_deg(left\_x, x\_left, x\_right)

&#x20;   right\_phase = pixel\_to\_phase\_deg(right\_x, x\_left, x\_right)

&#x20;   gap\_angle = right\_phase - left\_phase



&#x20;   if gap\_angle <= 0:

&#x20;       gap\_time\_ms = np.nan

&#x20;       gap\_band = "Invalid"

&#x20;       severity = "Invalid"

&#x20;       measurement\_status = "invalid\_lines"

&#x20;   else:

&#x20;       gap\_time\_ms = gap\_angle\_to\_ms(gap\_angle)

&#x20;       gap\_band = gap\_time\_band(gap\_time\_ms)

&#x20;       severity = severity\_from\_gap\_time\_and\_source(gap\_time\_ms, pd\_source\_type)



&#x20;       if auto\_result is not None:

&#x20;           auto\_left = auto\_result\["left\_line\_x"]

&#x20;           auto\_right = auto\_result\["right\_line\_x"]

&#x20;           if abs(left\_x - auto\_left) > 2 or abs(right\_x - auto\_right) > 2:

&#x20;               measurement\_status = "manually\_adjusted"

&#x20;           else:

&#x20;               measurement\_status = "auto\_accepted"

&#x20;       else:

&#x20;           measurement\_status = "manual\_or\_fallback"



&#x20;   row = {

&#x20;       "record\_id": RECORD\_ID,

&#x20;       "sample": SAMPLE,

&#x20;       "defect\_type": DEFECT\_TYPE,

&#x20;       "uploaded\_filename": uploaded\_filename,

&#x20;       "image\_path": IMAGE\_PATH,

&#x20;       "image\_width": w,

&#x20;       "image\_height": h,



&#x20;       "default\_size\_match": DEFAULT\_SIZE\_MATCH,

&#x20;       "calibration\_mode": calibration\_mode\_dropdown.value,

&#x20;       "auto\_calibration\_status": auto\_calibration\_status,



&#x20;       "x\_left\_0deg": x\_left,

&#x20;       "x\_right\_360deg": x\_right,

&#x20;       "y\_top\_plot": y\_top,

&#x20;       "y\_bottom\_plot": y\_bottom,



&#x20;       "corona\_percent\_input": corona\_pct\_input.value,

&#x20;       "surface\_percent\_input": surface\_pct\_input.value,

&#x20;       "internal\_percent\_input": internal\_pct\_input.value,

&#x20;       "pd\_rule\_class": latest\_pd\_rule\_class,

&#x20;       "pd\_selection\_rule": latest\_pd\_selection\_rule,

&#x20;       "pd\_source\_type": pd\_source\_type,



&#x20;       "left\_line\_pixel": left\_x,

&#x20;       "right\_line\_pixel": right\_x,



&#x20;       "left\_phase\_deg": round(left\_phase, 4),

&#x20;       "right\_phase\_deg": round(right\_phase, 4),

&#x20;       "gap\_angle\_deg": round(gap\_angle, 4),

&#x20;       "gap\_time\_ms": round(gap\_time\_ms, 4) if not np.isnan(gap\_time\_ms) else np.nan,

&#x20;       "gap\_time\_band": gap\_band,



&#x20;       "severity\_by\_gap\_time": severity,

&#x20;       "gap\_measurement\_status": measurement\_status,

&#x20;       "auto\_detection\_status": auto\_detection\_status,

&#x20;       "remark": ""

&#x20;   }



&#x20;   if auto\_result is not None:

&#x20;       row\["detected\_case"] = auto\_result\["detected\_case"]

&#x20;       row\["positive\_x\_range\_pixel"] = str(auto\_result\["positive\_x\_range\_pixel"])

&#x20;       row\["negative\_x\_range\_pixel"] = str(auto\_result\["negative\_x\_range\_pixel"])

&#x20;       row\["positive\_x\_range\_phase"] = str(auto\_result\["positive\_x\_range\_phase"])

&#x20;       row\["negative\_x\_range\_phase"] = str(auto\_result\["negative\_x\_range\_phase"])

&#x20;   else:

&#x20;       row\["detected\_case"] = ""

&#x20;       row\["positive\_x\_range\_pixel"] = ""

&#x20;       row\["negative\_x\_range\_pixel"] = ""

&#x20;       row\["positive\_x\_range\_phase"] = ""

&#x20;       row\["negative\_x\_range\_phase"] = ""



&#x20;   save\_result\_by\_image(row, not\_measurable=False)





def on\_not\_measurable\_clicked(b):

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value

&#x20;   pd\_source\_type = pd\_source\_dropdown.value



&#x20;   row = {

&#x20;       "record\_id": RECORD\_ID,

&#x20;       "sample": SAMPLE,

&#x20;       "defect\_type": DEFECT\_TYPE,

&#x20;       "uploaded\_filename": uploaded\_filename,

&#x20;       "image\_path": IMAGE\_PATH,

&#x20;       "image\_width": w,

&#x20;       "image\_height": h,



&#x20;       "default\_size\_match": DEFAULT\_SIZE\_MATCH,

&#x20;       "calibration\_mode": calibration\_mode\_dropdown.value,

&#x20;       "auto\_calibration\_status": auto\_calibration\_status,



&#x20;       "x\_left\_0deg": x\_left,

&#x20;       "x\_right\_360deg": x\_right,

&#x20;       "y\_top\_plot": y\_top,

&#x20;       "y\_bottom\_plot": y\_bottom,



&#x20;       "corona\_percent\_input": corona\_pct\_input.value,

&#x20;       "surface\_percent\_input": surface\_pct\_input.value,

&#x20;       "internal\_percent\_input": internal\_pct\_input.value,

&#x20;       "pd\_rule\_class": latest\_pd\_rule\_class,

&#x20;       "pd\_selection\_rule": latest\_pd\_selection\_rule,

&#x20;       "pd\_source\_type": pd\_source\_type,



&#x20;       "left\_line\_pixel": np.nan,

&#x20;       "right\_line\_pixel": np.nan,



&#x20;       "left\_phase\_deg": np.nan,

&#x20;       "right\_phase\_deg": np.nan,

&#x20;       "gap\_angle\_deg": np.nan,

&#x20;       "gap\_time\_ms": np.nan,

&#x20;       "gap\_time\_band": "Not measurable",



&#x20;       "severity\_by\_gap\_time": "Not measurable",

&#x20;       "gap\_measurement\_status": "not\_measurable",

&#x20;       "auto\_detection\_status": auto\_detection\_status,



&#x20;       "detected\_case": "",

&#x20;       "positive\_x\_range\_pixel": "",

&#x20;       "negative\_x\_range\_pixel": "",

&#x20;       "positive\_x\_range\_phase": "",

&#x20;       "negative\_x\_range\_phase": "",

&#x20;       "remark": "single\_cluster\_or\_unclear\_prpd"

&#x20;   }



&#x20;   save\_result\_by\_image(row, not\_measurable=True)



accept\_button.on\_click(on\_accept\_clicked)

not\_measurable\_button.on\_click(on\_not\_measurable\_clicked)



\# =========================================================

\# DISPLAY UI

\# =========================================================



ui = widgets.VBox(\[

&#x20;   widgets.HTML("<h3>WORK B / MODEL 4: Gap-Time Measurement + New PD Source Rule + Cable Severity</h3>"),

&#x20;   warning\_html,



&#x20;   widgets.HTML("<b>Step 1: Choose or adjust PRPD axis calibration</b>"),

&#x20;   calibration\_mode\_dropdown,



&#x20;   widgets.HTML("<b>PRPD axis / plot frame calibration</b>"),

&#x20;   x\_left\_slider,

&#x20;   widgets.HBox(\[x\_left\_minus, x\_left\_plus]),



&#x20;   x\_right\_slider,

&#x20;   widgets.HBox(\[x\_right\_minus, x\_right\_plus]),



&#x20;   y\_top\_slider,

&#x20;   widgets.HBox(\[y\_top\_minus, y\_top\_plus]),



&#x20;   y\_bottom\_slider,

&#x20;   widgets.HBox(\[y\_bottom\_minus, y\_bottom\_plus]),



&#x20;   widgets.HBox(\[save\_calibration\_button, redetect\_gap\_button]),



&#x20;   widgets.HTML("<b>Step 2 optional: Apply PD source rule from AI confidence</b>"),

&#x20;   widgets.HTML("Rule priority: Surface > 60% and Internal > 60% → Joint; otherwise Corona/Surface/Internal > 80%."),

&#x20;   widgets.HBox(\[corona\_pct\_input, surface\_pct\_input, internal\_pct\_input]),

&#x20;   apply\_pd\_rule\_button,

&#x20;   pd\_rule\_output,



&#x20;   widgets.HTML("<b>Step 3: Confirm PD source type</b>"),

&#x20;   pd\_source\_dropdown,



&#x20;   widgets.HTML("<b>Step 4: Adjust gap lines</b>"),

&#x20;   left\_line\_slider,

&#x20;   widgets.HBox(\[left\_minus, left\_plus]),



&#x20;   right\_line\_slider,

&#x20;   widgets.HBox(\[right\_minus, right\_plus]),



&#x20;   widgets.HTML("<b>Step 5: Save result</b>"),

&#x20;   widgets.HBox(\[accept\_button, not\_measurable\_button]),



&#x20;   output

])



display(ui)



\# Initial gap detection with safe initial calibration

redetect\_gap\_lines()



**PART3 CMD FINAL CODE** 

\# =========================================================

\# CMD FINAL CODE - AI Classification + Auto-suggested Gap-time + Smart Save

\# TOPCLASS RULE V2 + EXCEL REVIEW OUTPUT

\# เวอร์ชันนี้: comment/โครงโค้ดมีไทยช่วยอ่านง่าย แต่ output/UI เป็น English ล้วน

\# =========================================================

\# Flow หลักของ Final CMD:

\# - Upload PRPD required / TF Map optional

\# - ตรวจ input quality + ถ้ามี warning ให้ user confirm ก่อนรัน

\# - Model 2: PRPD-only classification

\# - Model 3: Hybrid PRPD + TF Map classification

\# - LOCKED AI RESULT PANEL แสดงผล AI ค้างไว้

\# - NEW AI RULE:

\#   ถ้า Corona / Surface / Internal ทุกตัว <= 30% => Non-identified

\#   ถ้ามี class ใด > 30% => ใช้ top class ที่ confidence สูงสุด

\# - PD source rule + top-class fallback

\# - Calibration Preset Memory

\# - Auto Gap-time v1 ใช้เป็นเส้นแนะนำเริ่มต้นเท่านั้น ไม่ใช่ final measurement

\# - User/expert ต้อง confirm หรือ adjust เส้นก่อน save

\# - Save result ลงโฟลเดอร์ใหม่ ไม่ทับผลเก่า

\# - Save CSV เดิม + Excel review พร้อมรูป annotated Gap-time

\# =========================================================



from google.colab import drive

drive.mount("/content/drive")



import os

import re

import io

import cv2

import json

import math

import numpy as np

import pandas as pd

import matplotlib.pyplot as plt

import tensorflow as tf

import ipywidgets as widgets



from PIL import Image

from datetime import datetime

from IPython.display import display, clear\_output



from openpyxl import Workbook, load\_workbook

from openpyxl.drawing.image import Image as XLImage

from openpyxl.styles import Alignment, Font, PatternFill, Border, Side



\# =========================================================

\# PATH SETTINGS

\# ตั้ง path ของโมเดลและโฟลเดอร์ผลลัพธ์ทั้งหมด

\# =========================================================



PRPD\_ONLY\_MODEL\_PATH = "/content/drive/MyDrive/PRPD\_2\_Only\_best.keras"

HYBRID\_MODEL\_PATH = "/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras"



AUTO\_GAP\_MODEL\_PATH = "/content/drive/MyDrive/CMD\_auto\_gap\_model/models/auto\_gap\_time\_abstract\_v1.keras"

AUTO\_GAP\_MODEL\_VERSION = "auto\_gap\_time\_abstract\_v1"



ABSTRACT\_MAPPING\_CSV = "/content/drive/MyDrive/dataset\_main\_4th\_extracted/mapping\_dataset\_main\_4th.csv"



\# =========================================================

\# NEW OUTPUT ROOT - TOP CLASS RULE V2

\# ผลรอบใหม่ แยกจากผลเก่าทั้งหมด

\# =========================================================



NEW\_RESULT\_ROOT = "/content/drive/MyDrive/CMD\_FINAL\_RESULTS\_TOPCLASS\_RULE\_V2\_20260523"



ABSTRACT\_RESULT\_ROOT = NEW\_RESULT\_ROOT

ABSTRACT\_BY\_IMAGE\_DIR = os.path.join(ABSTRACT\_RESULT\_ROOT, "by\_image")

ABSTRACT\_SUMMARY\_CSV = os.path.join(ABSTRACT\_RESULT\_ROOT, "final\_summary.csv")

ABSTRACT\_EDIT\_HISTORY\_CSV = os.path.join(ABSTRACT\_RESULT\_ROOT, "edit\_history.csv")



EXTERNAL\_RESULT\_ROOT = os.path.join(NEW\_RESULT\_ROOT, "external\_cases")

EXTERNAL\_BY\_IMAGE\_DIR = os.path.join(EXTERNAL\_RESULT\_ROOT, "by\_image")

EXTERNAL\_SUMMARY\_CSV = os.path.join(EXTERNAL\_RESULT\_ROOT, "external\_summary.csv")



EXCEL\_RESULT\_DIR = os.path.join(NEW\_RESULT\_ROOT, "excel")

MASTER\_EXCEL\_PATH = os.path.join(EXCEL\_RESULT\_DIR, "CMD\_gap\_time\_review\_results\_TOPCLASS\_RULE\_V2.xlsx")



REVIEWER\_ROOT\_DIR = os.path.join(NEW\_RESULT\_ROOT, "by\_reviewer")



CALIBRATION\_DIR = os.path.join(NEW\_RESULT\_ROOT, "calibration")

CALIBRATION\_PRESET\_CSV = os.path.join(CALIBRATION\_DIR, "calibration\_preset.csv")



for d in \[

&#x20;   ABSTRACT\_RESULT\_ROOT,

&#x20;   ABSTRACT\_BY\_IMAGE\_DIR,

&#x20;   EXTERNAL\_RESULT\_ROOT,

&#x20;   EXTERNAL\_BY\_IMAGE\_DIR,

&#x20;   EXCEL\_RESULT\_DIR,

&#x20;   REVIEWER\_ROOT\_DIR,

&#x20;   CALIBRATION\_DIR

]:

&#x20;   os.makedirs(d, exist\_ok=True)



\# =========================================================

\# SETTINGS

\# ค่าคงที่หลักของระบบ เช่น class name, threshold, default calibration

\# =========================================================



FINAL\_CODE\_VERSION = "CMD\_FINAL\_V2\_TOPCLASS\_RULE\_30\_EXCEL\_REVIEW\_20260523"



CLASS\_NAMES = \["Corona", "Surface", "Internal"]



IMG\_SIZE\_CLASSIFICATION = 224

IMG\_SIZE\_AUTO\_GAP = 224



\# Old threshold kept only for reference

CONFIDENCE\_THRESHOLD = 85.0



\# New advisor rule:

\# If Corona/Surface/Internal are all <= 30% => Non-identified

\# If any class > 30% => use top class and confidence

TOPCLASS\_THRESHOLD = 30.0



DEFAULT\_IMAGE\_WIDTH = 388

DEFAULT\_IMAGE\_HEIGHT = 281



DEFAULT\_X\_LEFT = 73

DEFAULT\_X\_RIGHT = 348

DEFAULT\_Y\_TOP = 16

DEFAULT\_Y\_BOTTOM = 233



CYCLE\_TIME\_MS = 20.0  # 50 Hz, 360 degree = 20 ms



PD\_SOURCE\_OPTIONS = \[

&#x20;   "Floating / Corona / Bad contact",

&#x20;   "Outside surface discharge",

&#x20;   "Terminations / Joint",

&#x20;   "Internal",

&#x20;   "Manual confirmation required"

]



REVIEW\_STATUS\_OPTIONS = \[

&#x20;   "user\_confirmed",

&#x20;   "expert\_corrected",

&#x20;   "not\_measurable"

]



REVIEWER\_ROLE\_OPTIONS = \[

&#x20;   "researcher",

&#x20;   "expert",

&#x20;   "user",

&#x20;   "advisor",

&#x20;   "operator"

]



NOT\_MEASURABLE\_REASON\_OPTIONS = \[

&#x20;   "",

&#x20;   "single\_discharge\_cluster",

&#x20;   "unclear\_prpd\_pattern",

&#x20;   "cropped\_axis",

&#x20;   "low\_image\_quality",

&#x20;   "wrong\_input",

&#x20;   "other"

]



ALLOWED\_EXTENSIONS = \[".jpg", ".jpeg", ".png", ".bmp"]



\# =========================================================

\# LOAD MODELS

\# โหลด Model 2, Model 3 และ Auto Gap-time v1

\# Output ที่ print ออกหน้าจอเป็น English ล้วน

\# =========================================================



print("=" \* 100)

print("LOADING MODELS")

print("=" \* 100)



prpd\_only\_model = None

hybrid\_model = None

auto\_gap\_model = None



if os.path.exists(PRPD\_ONLY\_MODEL\_PATH):

&#x20;   prpd\_only\_model = tf.keras.models.load\_model(PRPD\_ONLY\_MODEL\_PATH, compile=False)

&#x20;   print("Model 2 loaded:", PRPD\_ONLY\_MODEL\_PATH)

else:

&#x20;   print("WARNING: Model 2 not found:", PRPD\_ONLY\_MODEL\_PATH)



if os.path.exists(HYBRID\_MODEL\_PATH):

&#x20;   hybrid\_model = tf.keras.models.load\_model(HYBRID\_MODEL\_PATH, compile=False)

&#x20;   print("Model 3 loaded:", HYBRID\_MODEL\_PATH)

else:

&#x20;   print("WARNING: Model 3 not found:", HYBRID\_MODEL\_PATH)



if os.path.exists(AUTO\_GAP\_MODEL\_PATH):

&#x20;   auto\_gap\_model = tf.keras.models.load\_model(AUTO\_GAP\_MODEL\_PATH, compile=False)

&#x20;   print("Auto Gap-time model loaded:", AUTO\_GAP\_MODEL\_PATH)

else:

&#x20;   print("WARNING: Auto Gap-time model not found. Rule-based/manual fallback will be used.")

&#x20;   print("Missing:", AUTO\_GAP\_MODEL\_PATH)



print("\\nModel status:")

print("PRPD-only model available :", prpd\_only\_model is not None)

print("Hybrid model available    :", hybrid\_model is not None)

print("Auto Gap model available  :", auto\_gap\_model is not None)



\# =========================================================

\# LOAD ABSTRACT MAPPING

\# ใช้เช็คว่าไฟล์ที่ upload เป็น case ใน Abstract/CMD dataset หรือไม่

\# =========================================================



df\_mapping = None



if os.path.exists(ABSTRACT\_MAPPING\_CSV):

&#x20;   df\_mapping = pd.read\_csv(ABSTRACT\_MAPPING\_CSV)

&#x20;   print("\\nAbstract mapping loaded:", ABSTRACT\_MAPPING\_CSV)

&#x20;   print("Mapping rows:", len(df\_mapping))

else:

&#x20;   print("\\nWARNING: Abstract mapping not found:", ABSTRACT\_MAPPING\_CSV)

&#x20;   print("Abstract/external case check will use filename heuristics only.")



\# =========================================================

\# GLOBAL STATE

\# ตัวแปรกลางสำหรับเก็บสถานะของเคสที่กำลังวิเคราะห์

\# =========================================================



state = {

&#x20;   "prpd\_filename": "",

&#x20;   "tf\_filename": "",



&#x20;   "prpd\_bytes": None,

&#x20;   "tf\_bytes": None,



&#x20;   "prpd\_rgb": None,

&#x20;   "tf\_rgb": None,



&#x20;   "input\_quality": None,

&#x20;   "abstract\_info": None,



&#x20;   "ai\_result": None,



&#x20;   "image\_width": None,

&#x20;   "image\_height": None,

&#x20;   "default\_size\_match": False,



&#x20;   "auto\_x\_left": None,

&#x20;   "auto\_x\_right": None,

&#x20;   "auto\_y\_top": None,

&#x20;   "auto\_y\_bottom": None,

&#x20;   "auto\_calibration\_status": "",



&#x20;   "calibration\_source": "",

&#x20;   "calibration\_preset\_loaded": False,

&#x20;   "calibration\_preset\_path": CALIBRATION\_PRESET\_CSV,



&#x20;   "rule\_based\_result": None,

&#x20;   "rule\_based\_status": "not\_detected\_yet",



&#x20;   "auto\_gap\_model\_available": auto\_gap\_model is not None,

&#x20;   "auto\_gap\_model\_path": AUTO\_GAP\_MODEL\_PATH if auto\_gap\_model is not None else "",

&#x20;   "auto\_gap\_model\_version": AUTO\_GAP\_MODEL\_VERSION if auto\_gap\_model is not None else "",

&#x20;   "auto\_gap\_status": "not\_run",

&#x20;   "auto\_left\_line\_pixel": np.nan,

&#x20;   "auto\_right\_line\_pixel": np.nan,

&#x20;   "auto\_left\_phase\_deg": np.nan,

&#x20;   "auto\_right\_phase\_deg": np.nan,

&#x20;   "auto\_gap\_time\_ms": np.nan,



&#x20;   "initial\_line\_source": "",

&#x20;   "manual\_adjustment\_detected": False,



&#x20;   # สถานะนี้ใช้ตามเกณฑ์อาจารย์:

&#x20;   # ถ้ามี discharge cluster เพียงฝั่งเดียว ให้จัดเป็น Gap-time not measurable

&#x20;   "cluster\_detection\_status": "not\_checked",

&#x20;   "gap\_not\_measurable\_recommended": False,

&#x20;   "gap\_not\_measurable\_reason": ""

}



\# =========================================================

\# BASIC HELPERS

\# ฟังก์ชันช่วยจัดการชื่อไฟล์ เวลา upload image และ path ต่าง ๆ

\# =========================================================



def now\_str():

&#x20;   return datetime.now().strftime("%Y-%m-%d %H:%M:%S")





def timestamp\_str():

&#x20;   return datetime.now().strftime("%Y%m%d\_%H%M%S")





def safe\_name(name):

&#x20;   name = os.path.splitext(os.path.basename(str(name)))\[0]

&#x20;   name = re.sub(r"\[^\\w\\-]+", "\_", name)

&#x20;   name = re.sub(r"\_+", "\_", name).strip("\_")

&#x20;   if name == "":

&#x20;       name = "unknown\_case"

&#x20;   return name





def safe\_text\_name(text):

&#x20;   text = str(text).strip()

&#x20;   text = re.sub(r"\[^\\w\\-ก-๙]+", "\_", text)

&#x20;   text = re.sub(r"\_+", "\_", text).strip("\_")

&#x20;   if text == "":

&#x20;       text = "unknown"

&#x20;   return text





def get\_fileupload\_item(upload\_widget):

&#x20;   val = upload\_widget.value



&#x20;   if val is None:

&#x20;       return None



&#x20;   if isinstance(val, (tuple, list)):

&#x20;       if len(val) == 0:

&#x20;           return None

&#x20;       item = val\[0]

&#x20;       name = item.get("name", "")

&#x20;       content = item.get("content", b"")

&#x20;       return {"name": name, "content": bytes(content)}



&#x20;   if isinstance(val, dict):

&#x20;       if len(val) == 0:

&#x20;           return None

&#x20;       name = list(val.keys())\[0]

&#x20;       item = val\[name]

&#x20;       content = item.get("content", b"")

&#x20;       return {"name": name, "content": bytes(content)}



&#x20;   return None





def bytes\_to\_rgb(image\_bytes):

&#x20;   img = Image.open(io.BytesIO(image\_bytes)).convert("RGB")

&#x20;   return np.array(img)





def save\_bytes(path, data\_bytes):

&#x20;   os.makedirs(os.path.dirname(path), exist\_ok=True)

&#x20;   with open(path, "wb") as f:

&#x20;       f.write(data\_bytes)





def file\_ext\_ok(filename):

&#x20;   ext = os.path.splitext(str(filename))\[1].lower()

&#x20;   return ext in ALLOWED\_EXTENSIONS





def extract\_case\_key(filename):

&#x20;   s = os.path.splitext(os.path.basename(str(filename)))\[0].lower()



&#x20;   remove\_tokens = \[

&#x20;       "\_prpd", "-prpd", " prpd",

&#x20;       "\_tf", "-tf", " tf",

&#x20;       "\_tfmap", "-tfmap", " tfmap",

&#x20;       "\_twmap", "-twmap", " twmap",

&#x20;       "\_pattern", "-pattern", " pattern",

&#x20;       "\_entirepattern", "-entirepattern", " entirepattern"

&#x20;   ]



&#x20;   for t in remove\_tokens:

&#x20;       s = s.replace(t, "")



&#x20;   s = s.replace(".", "\_")

&#x20;   s = re.sub(r"\[^\\w]+", "\_", s)

&#x20;   s = re.sub(r"\_+", "\_", s).strip("\_")

&#x20;   return s





def filename\_suggests\_prpd(filename):

&#x20;   s = str(filename).lower()

&#x20;   keys = \["prpd", "pattern", "entirepattern"]

&#x20;   bad = \["tf", "tfmap", "twmap", "timefrequency", "time\_frequency"]

&#x20;   if any(k in s for k in bad) and not any(k in s for k in keys):

&#x20;       return False

&#x20;   if any(k in s for k in keys):

&#x20;       return True

&#x20;   return None





def filename\_suggests\_tf(filename):

&#x20;   s = str(filename).lower()

&#x20;   keys = \["tf", "tfmap", "twmap", "timefrequency", "time\_frequency"]

&#x20;   bad = \["prpd", "pattern", "entirepattern"]

&#x20;   if any(k in s for k in bad) and not any(k in s for k in keys):

&#x20;       return False

&#x20;   if any(k in s for k in keys):

&#x20;       return True

&#x20;   return None



\# =========================================================

\# CLASSIFICATION PREPROCESSING

\# Preprocess ภาพก่อนส่งเข้า Model 2 / Model 3 / Auto Gap-time

\# =========================================================



def preprocess\_image\_for\_classification(img\_rgb, img\_size=224):

&#x20;   img = tf.convert\_to\_tensor(img\_rgb, dtype=tf.uint8)



&#x20;   gray = tf.image.rgb\_to\_grayscale(img)

&#x20;   gray = tf.cast(gray, tf.float32)



&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (gray - pmin) / (pmax - pmin + 1e-5)

&#x20;   final = 1.0 - stretched

&#x20;   final = tf.image.grayscale\_to\_rgb(final)



&#x20;   final = tf.image.resize\_with\_pad(final, img\_size, img\_size)

&#x20;   final = tf.clip\_by\_value(final, 0.0, 1.0)



&#x20;   return final





def make\_model\_input(img\_rgb):

&#x20;   img = preprocess\_image\_for\_classification(img\_rgb, IMG\_SIZE\_CLASSIFICATION)

&#x20;   return tf.expand\_dims(img, axis=0)





def preprocess\_image\_for\_auto\_gap(img\_rgb, img\_size=224):

&#x20;   img = tf.convert\_to\_tensor(img\_rgb, dtype=tf.uint8)



&#x20;   gray = tf.image.rgb\_to\_grayscale(img)

&#x20;   gray = tf.cast(gray, tf.float32)



&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (gray - pmin) / (pmax - pmin + 1e-5)

&#x20;   final = 1.0 - stretched

&#x20;   final = tf.image.grayscale\_to\_rgb(final)



&#x20;   final = tf.image.resize\_with\_pad(final, img\_size, img\_size)

&#x20;   final = tf.clip\_by\_value(final, 0.0, 1.0)



&#x20;   return final



\# =========================================================

\# PD SOURCE RULE

\# เกณฑ์เลือก PD source ล่าสุด: strong rule + top-class fallback

\# =========================================================



def map\_class\_to\_pd\_source(class\_name):

&#x20;   if class\_name == "Corona":

&#x20;       return "Floating / Corona / Bad contact"

&#x20;   elif class\_name == "Surface":

&#x20;       return "Outside surface discharge"

&#x20;   elif class\_name == "Internal":

&#x20;       return "Internal"

&#x20;   elif class\_name == "Non-identified":

&#x20;       return "Manual confirmation required"

&#x20;   else:

&#x20;       return "Manual confirmation required"





def select\_pd\_source\_by\_confidence(corona\_pct, surface\_pct, internal\_pct):

&#x20;   scores = {

&#x20;       "Corona": float(corona\_pct),

&#x20;       "Surface": float(surface\_pct),

&#x20;       "Internal": float(internal\_pct)

&#x20;   }



&#x20;   if scores\["Surface"] > 60 and scores\["Internal"] > 60:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Joint",

&#x20;           "pd\_source\_type": "Terminations / Joint",

&#x20;           "pd\_selection\_rule": "surface\_gt\_60\_and\_internal\_gt\_60",

&#x20;           "is\_strong\_rule": True,

&#x20;           "requires\_manual\_confirmation": False

&#x20;       }



&#x20;   if scores\["Corona"] > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Corona",

&#x20;           "pd\_source\_type": "Floating / Corona / Bad contact",

&#x20;           "pd\_selection\_rule": "corona\_gt\_80",

&#x20;           "is\_strong\_rule": True,

&#x20;           "requires\_manual\_confirmation": False

&#x20;       }



&#x20;   if scores\["Surface"] > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Surface",

&#x20;           "pd\_source\_type": "Outside surface discharge",

&#x20;           "pd\_selection\_rule": "surface\_gt\_80",

&#x20;           "is\_strong\_rule": True,

&#x20;           "requires\_manual\_confirmation": False

&#x20;       }



&#x20;   if scores\["Internal"] > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Internal",

&#x20;           "pd\_source\_type": "Internal",

&#x20;           "pd\_selection\_rule": "internal\_gt\_80",

&#x20;           "is\_strong\_rule": True,

&#x20;           "requires\_manual\_confirmation": False

&#x20;       }



&#x20;   top\_class = max(scores, key=scores.get)

&#x20;   top\_score = scores\[top\_class]



&#x20;   return {

&#x20;       "pd\_rule\_class": top\_class,

&#x20;       "pd\_source\_type": map\_class\_to\_pd\_source(top\_class),

&#x20;       "pd\_selection\_rule": f"top\_class\_fallback\_{top\_class.lower()}\_{top\_score:.2f}\_manual\_confirm",

&#x20;       "is\_strong\_rule": False,

&#x20;       "requires\_manual\_confirmation": True

&#x20;   }





def make\_percent\_bar(percent, unit=5):

&#x20;   filled = int(float(percent) / unit)

&#x20;   empty = max(0, 20 - filled)

&#x20;   return "█" \* filled + "░" \* empty





def make\_ai\_display\_text(ai):

&#x20;   """

&#x20;   Text for plot title / annotated image.

&#x20;   Avoid showing Non-identified as 100% confidence.

&#x20;   """



&#x20;   if ai is None:

&#x20;       return "AI: Not executed"



&#x20;   if ai\["final\_result"] == "Non-identified":

&#x20;       return "AI result: Non-identified"



&#x20;   return f"AI top class: {ai\['final\_result']} ({ai\['final\_score']:.2f}%)"



\# =========================================================

\# AI CLASSIFICATION

\# ฟังก์ชันรัน Model 2 / Model 3 และจัดรูปแบบผล AI

\# =========================================================



def run\_prpd\_only\_ai(prpd\_rgb):

&#x20;   if prpd\_only\_model is None:

&#x20;       raise RuntimeError("PRPD-only model is not loaded.")



&#x20;   prpd\_input = make\_model\_input(prpd\_rgb)

&#x20;   preds = prpd\_only\_model.predict(prpd\_input, verbose=0)\[0]

&#x20;   scores\_percent = preds \* 100.0



&#x20;   return build\_ai\_result(

&#x20;       scores\_percent=scores\_percent,

&#x20;       raw\_prediction=preds,

&#x20;       input\_mode="PRPD\_ONLY",

&#x20;       model\_used="Model 2: PRPD\_2\_Only",

&#x20;       model\_path=PRPD\_ONLY\_MODEL\_PATH

&#x20;   )





def run\_hybrid\_ai(prpd\_rgb, tf\_rgb):

&#x20;   if hybrid\_model is None:

&#x20;       raise RuntimeError("Hybrid model is not loaded.")



&#x20;   prpd\_input = make\_model\_input(prpd\_rgb)

&#x20;   tf\_input = make\_model\_input(tf\_rgb)



&#x20;   input\_names = \[inp.name.split(":")\[0].split("/")\[0] for inp in hybrid\_model.inputs]



&#x20;   try:

&#x20;       if "prpd\_input" in input\_names and "tf\_input" in input\_names:

&#x20;           preds = hybrid\_model.predict(

&#x20;               {"prpd\_input": prpd\_input, "tf\_input": tf\_input},

&#x20;               verbose=0

&#x20;           )\[0]

&#x20;       else:

&#x20;           preds = hybrid\_model.predict(\[prpd\_input, tf\_input], verbose=0)\[0]

&#x20;   except Exception:

&#x20;       preds = hybrid\_model.predict(\[prpd\_input, tf\_input], verbose=0)\[0]



&#x20;   scores\_percent = preds \* 100.0



&#x20;   return build\_ai\_result(

&#x20;       scores\_percent=scores\_percent,

&#x20;       raw\_prediction=preds,

&#x20;       input\_mode="HYBRID\_PRPD\_TF",

&#x20;       model\_used="Model 3: PRPD\_3\_Hybrid",

&#x20;       model\_path=HYBRID\_MODEL\_PATH

&#x20;   )





def build\_ai\_result(scores\_percent, raw\_prediction, input\_mode, model\_used, model\_path):

&#x20;   """

&#x20;   New top-class rule:

&#x20;   - If Corona/Surface/Internal are all <= 30% => Non-identified

&#x20;   - If any class > 30% => final result = top class with max confidence

&#x20;   """



&#x20;   scores\_percent = np.array(scores\_percent).astype(float)



&#x20;   top\_idx = int(np.argmax(scores\_percent))

&#x20;   top\_class = CLASS\_NAMES\[top\_idx]

&#x20;   top\_score = float(scores\_percent\[top\_idx])



&#x20;   confidence\_dict = {

&#x20;       CLASS\_NAMES\[i]: float(scores\_percent\[i])

&#x20;       for i in range(3)

&#x20;   }



&#x20;   corona\_pct = confidence\_dict.get("Corona", 0.0)

&#x20;   surface\_pct = confidence\_dict.get("Surface", 0.0)

&#x20;   internal\_pct = confidence\_dict.get("Internal", 0.0)



&#x20;   all\_low = (

&#x20;       corona\_pct <= TOPCLASS\_THRESHOLD and

&#x20;       surface\_pct <= TOPCLASS\_THRESHOLD and

&#x20;       internal\_pct <= TOPCLASS\_THRESHOLD

&#x20;   )



&#x20;   if all\_low:

&#x20;       final\_result = "Non-identified"

&#x20;       final\_score = top\_score

&#x20;       status = "non\_identified\_all\_classes\_le\_30"

&#x20;       non\_identified\_percent = 100.0

&#x20;       high\_conf\_count = 0



&#x20;       pd\_rule\_result = {

&#x20;           "pd\_rule\_class": "Non-identified",

&#x20;           "pd\_source\_type": "Manual confirmation required",

&#x20;           "pd\_selection\_rule": "all\_classes\_le\_30\_manual\_confirmation\_required",

&#x20;           "is\_strong\_rule": False,

&#x20;           "requires\_manual\_confirmation": True

&#x20;       }



&#x20;   else:

&#x20;       final\_result = top\_class

&#x20;       final\_score = top\_score

&#x20;       status = "identified\_by\_top\_class\_gt\_30"

&#x20;       non\_identified\_percent = 0.0

&#x20;       high\_conf\_count = int(np.sum(scores\_percent > TOPCLASS\_THRESHOLD))



&#x20;       pd\_rule\_result = select\_pd\_source\_by\_confidence(

&#x20;           corona\_pct=corona\_pct,

&#x20;           surface\_pct=surface\_pct,

&#x20;           internal\_pct=internal\_pct

&#x20;       )



&#x20;   return {

&#x20;       "input\_mode": input\_mode,

&#x20;       "model\_used": model\_used,

&#x20;       "model\_path\_used": model\_path,



&#x20;       "raw\_prediction": raw\_prediction,

&#x20;       "scores\_percent": scores\_percent,

&#x20;       "confidence\_dict": confidence\_dict,



&#x20;       "top\_class": top\_class,

&#x20;       "top\_score": top\_score,



&#x20;       "final\_result": final\_result,

&#x20;       "final\_score": float(final\_score),

&#x20;       "non\_identified\_percent": float(non\_identified\_percent),

&#x20;       "status": status,

&#x20;       "high\_conf\_count": int(high\_conf\_count),



&#x20;       "ai\_decision\_rule": "top\_class\_gt\_30\_else\_non\_identified",

&#x20;       "ai\_threshold\_percent": TOPCLASS\_THRESHOLD,



&#x20;       "pd\_rule\_class": pd\_rule\_result\["pd\_rule\_class"],

&#x20;       "pd\_selection\_rule": pd\_rule\_result\["pd\_selection\_rule"],

&#x20;       "suggested\_pd\_source": pd\_rule\_result\["pd\_source\_type"],

&#x20;       "is\_strong\_pd\_rule": pd\_rule\_result\["is\_strong\_rule"],

&#x20;       "requires\_manual\_confirmation": pd\_rule\_result\["requires\_manual\_confirmation"]

&#x20;   }



\# =========================================================

\# GAP-TIME FUNCTIONS

\# ฟังก์ชันแปลง pixel ↔ phase และคำนวณ gap-time/severity

\# =========================================================



def pixel\_to\_phase\_deg(x\_pixel, x\_left, x\_right):

&#x20;   return (x\_pixel - x\_left) / (x\_right - x\_left) \* 360.0





def phase\_deg\_to\_pixel(phase\_deg, x\_left, x\_right):

&#x20;   return x\_left + (phase\_deg / 360.0) \* (x\_right - x\_left)





def gap\_angle\_to\_ms(gap\_angle\_deg):

&#x20;   return gap\_angle\_deg \* CYCLE\_TIME\_MS / 360.0





def gap\_time\_band(gap\_time\_ms):

&#x20;   if gap\_time\_ms is None or np.isnan(gap\_time\_ms):

&#x20;       return "Not measurable"

&#x20;   if gap\_time\_ms > 7:

&#x20;       return "> 7 ms"

&#x20;   elif 4 <= gap\_time\_ms <= 7:

&#x20;       return "4–7 ms"

&#x20;   else:

&#x20;       return "< 4 ms"





def severity\_from\_gap\_time\_and\_source(gap\_time\_ms, pd\_source\_type):

&#x20;   if gap\_time\_ms is None or np.isnan(gap\_time\_ms):

&#x20;       return "Not measurable"



&#x20;   if pd\_source\_type in \[

&#x20;       "Floating / Corona / Bad contact",

&#x20;       "Outside surface discharge"

&#x20;   ]:

&#x20;       if gap\_time\_ms > 7:

&#x20;           return "Initial"

&#x20;       elif 4 <= gap\_time\_ms <= 7:

&#x20;           return "Moderate"

&#x20;       else:

&#x20;           return "High"



&#x20;   elif pd\_source\_type in \[

&#x20;       "Terminations / Joint",

&#x20;       "Internal"

&#x20;   ]:

&#x20;       if gap\_time\_ms > 7:

&#x20;           return "Moderate"

&#x20;       elif 4 <= gap\_time\_ms <= 7:

&#x20;           return "High"

&#x20;       else:

&#x20;           return "High"



&#x20;   return "Unknown"



\# =========================================================

\# PLOT FRAME DETECTION / RULE-BASED GAP

\# ตรวจกรอบกราฟ PRPD และหาเส้น gap แบบ rule-based fallback

\# =========================================================



def detect\_prpd\_plot\_frame(img\_bgr):

&#x20;   gray = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2GRAY)



&#x20;   blur = cv2.GaussianBlur(gray, (3, 3), 0)

&#x20;   edges = cv2.Canny(blur, 50, 150)



&#x20;   kernel = np.ones((3, 3), np.uint8)

&#x20;   edges\_dilated = cv2.dilate(edges, kernel, iterations=1)



&#x20;   contours, \_ = cv2.findContours(

&#x20;       edges\_dilated,

&#x20;       cv2.RETR\_EXTERNAL,

&#x20;       cv2.CHAIN\_APPROX\_SIMPLE

&#x20;   )



&#x20;   candidates = \[]

&#x20;   img\_h, img\_w = gray.shape

&#x20;   img\_area = img\_w \* img\_h



&#x20;   for cnt in contours:

&#x20;       x, y, ww, hh = cv2.boundingRect(cnt)

&#x20;       area = ww \* hh



&#x20;       if area < 0.08 \* img\_area:

&#x20;           continue

&#x20;       if area > 0.90 \* img\_area:

&#x20;           continue

&#x20;       if ww < 0.35 \* img\_w:

&#x20;           continue

&#x20;       if hh < 0.25 \* img\_h:

&#x20;           continue



&#x20;       aspect = ww / max(hh, 1)



&#x20;       if aspect < 0.8 or aspect > 2.8:

&#x20;           continue



&#x20;       cx = x + ww / 2

&#x20;       cy = y + hh / 2



&#x20;       center\_score = 1.0 - (

&#x20;           abs(cx - img\_w / 2) / (img\_w / 2) \* 0.5

&#x20;           + abs(cy - img\_h / 2) / (img\_h / 2) \* 0.5

&#x20;       )



&#x20;       score = area \* center\_score



&#x20;       candidates.append({

&#x20;           "x": x,

&#x20;           "y": y,

&#x20;           "w": ww,

&#x20;           "h": hh,

&#x20;           "area": area,

&#x20;           "aspect": aspect,

&#x20;           "score": score

&#x20;       })



&#x20;   if len(candidates) > 0:

&#x20;       best = sorted(candidates, key=lambda d: d\["score"], reverse=True)\[0]

&#x20;       x\_left = best\["x"]

&#x20;       x\_right = best\["x"] + best\["w"]

&#x20;       y\_top = best\["y"]

&#x20;       y\_bottom = best\["y"] + best\["h"]



&#x20;       plot\_area\_ratio = (best\["w"] \* best\["h"]) / img\_area



&#x20;       return x\_left, x\_right, y\_top, y\_bottom, "auto\_contour\_detected", plot\_area\_ratio



&#x20;   fallback = (

&#x20;       int(img\_w \* 0.18),

&#x20;       int(img\_w \* 0.88),

&#x20;       int(img\_h \* 0.15),

&#x20;       int(img\_h \* 0.85),

&#x20;       "auto\_failed\_manual\_required",

&#x20;       np.nan

&#x20;   )

&#x20;   return fallback





def clean\_binary\_mask(binary\_mask, min\_area=2, max\_area=None):

&#x20;   m = (binary\_mask.astype(np.uint8) \* 255)

&#x20;   m = cv2.medianBlur(m, 3)



&#x20;   num\_labels, labels, stats, \_ = cv2.connectedComponentsWithStats(

&#x20;       m,

&#x20;       connectivity=8

&#x20;   )



&#x20;   clean = np.zeros\_like(m)



&#x20;   if max\_area is None:

&#x20;       max\_area = m.shape\[0] \* m.shape\[1]



&#x20;   for i in range(1, num\_labels):

&#x20;       area = stats\[i, cv2.CC\_STAT\_AREA]

&#x20;       if min\_area <= area <= max\_area:

&#x20;           clean\[labels == i] = 255



&#x20;   return clean > 0





def auto\_detect\_gap\_lines\_rule\_based(img\_rgb, x\_left, x\_right, y\_top, y\_bottom):

&#x20;   crop = img\_rgb\[y\_top:y\_bottom, x\_left:x\_right].copy()



&#x20;   if crop.size == 0:

&#x20;       return None, "empty\_crop"



&#x20;   crop\_h, crop\_w, \_ = crop.shape



&#x20;   hsv = cv2.cvtColor(crop, cv2.COLOR\_RGB2HSV)

&#x20;   gray = cv2.cvtColor(crop, cv2.COLOR\_RGB2GRAY)



&#x20;   dark\_mask = gray < 165

&#x20;   color\_mask = (hsv\[:, :, 1] > 35) \& (hsv\[:, :, 2] < 250)



&#x20;   mask = dark\_mask | color\_mask



&#x20;   border\_x = max(3, int(0.02 \* crop\_w))

&#x20;   border\_y = max(3, int(0.02 \* crop\_h))



&#x20;   mask\[:, :border\_x] = False

&#x20;   mask\[:, -border\_x:] = False

&#x20;   mask\[:border\_y, :] = False

&#x20;   mask\[-border\_y:, :] = False



&#x20;   y\_mid = crop\_h // 2

&#x20;   axis\_band = max(3, int(0.025 \* crop\_h))



&#x20;   mask\[max(0, y\_mid-axis\_band):min(crop\_h, y\_mid+axis\_band+1), :] = False



&#x20;   positive\_mask = np.zeros\_like(mask)

&#x20;   negative\_mask = np.zeros\_like(mask)



&#x20;   positive\_mask\[:y\_mid-axis\_band, :] = mask\[:y\_mid-axis\_band, :]

&#x20;   negative\_mask\[y\_mid+axis\_band:, :] = mask\[y\_mid+axis\_band:, :]



&#x20;   max\_component\_area = int(0.30 \* crop\_w \* crop\_h)



&#x20;   positive\_mask = clean\_binary\_mask(

&#x20;       positive\_mask,

&#x20;       min\_area=2,

&#x20;       max\_area=max\_component\_area

&#x20;   )



&#x20;   negative\_mask = clean\_binary\_mask(

&#x20;       negative\_mask,

&#x20;       min\_area=2,

&#x20;       max\_area=max\_component\_area

&#x20;   )



&#x20;   pos\_y, pos\_x = np.where(positive\_mask)

&#x20;   neg\_y, neg\_x = np.where(negative\_mask)



&#x20;   # ตามเกณฑ์อาจารย์: ถ้าเห็น discharge cluster เพียงฝั่งเดียว ให้จัดเป็น Gap-time not measurable

&#x20;   if len(pos\_x) < 10 and len(neg\_x) >= 10:

&#x20;       return None, "single\_discharge\_cluster\_detected\_negative\_only"



&#x20;   if len(neg\_x) < 10 and len(pos\_x) >= 10:

&#x20;       return None, "single\_discharge\_cluster\_detected\_positive\_only"



&#x20;   if len(pos\_x) < 10 and len(neg\_x) < 10:

&#x20;       return None, "no\_clear\_discharge\_cluster\_detected"



&#x20;   pos\_left = int(np.percentile(pos\_x, 5))

&#x20;   pos\_right = int(np.percentile(pos\_x, 95))



&#x20;   neg\_left = int(np.percentile(neg\_x, 5))

&#x20;   neg\_right = int(np.percentile(neg\_x, 95))



&#x20;   if neg\_right < pos\_left:

&#x20;       left\_line\_crop\_x = neg\_right

&#x20;       right\_line\_crop\_x = pos\_left

&#x20;       detected\_case = "negative\_left\_positive\_right"



&#x20;   elif pos\_right < neg\_left:

&#x20;       left\_line\_crop\_x = pos\_right

&#x20;       right\_line\_crop\_x = neg\_left

&#x20;       detected\_case = "positive\_left\_negative\_right"



&#x20;   else:

&#x20;       return None, "clusters\_overlap\_or\_unclear"



&#x20;   gap\_width = right\_line\_crop\_x - left\_line\_crop\_x



&#x20;   if gap\_width < 3:

&#x20;       return None, "gap\_too\_small\_or\_invalid"



&#x20;   left\_line\_x = x\_left + int(left\_line\_crop\_x)

&#x20;   right\_line\_x = x\_left + int(right\_line\_crop\_x)



&#x20;   return {

&#x20;       "left\_line\_x": left\_line\_x,

&#x20;       "right\_line\_x": right\_line\_x,

&#x20;       "positive\_x\_range\_pixel": (x\_left + pos\_left, x\_left + pos\_right),

&#x20;       "negative\_x\_range\_pixel": (x\_left + neg\_left, x\_left + neg\_right),

&#x20;       "gap\_width\_pixel": gap\_width,

&#x20;       "detected\_case": detected\_case,

&#x20;       "pos\_points": len(pos\_x),

&#x20;       "neg\_points": len(neg\_x),

&#x20;   }, "rule\_based\_auto\_detected"



\# =========================================================

\# AUTO GAP-TIME MODEL SUGGESTION

\# ใช้ Auto Gap-time v1 เพื่อเสนอเส้นเริ่มต้นเท่านั้น

\# Final gap-time ต้องมาจาก user/expert confirmed lines

\# =========================================================



def predict\_auto\_gap\_lines\_model(img\_rgb, x\_left, x\_right):

&#x20;   if auto\_gap\_model is None:

&#x20;       return None, "auto\_gap\_model\_not\_available"



&#x20;   try:

&#x20;       img = preprocess\_image\_for\_auto\_gap(img\_rgb, IMG\_SIZE\_AUTO\_GAP)

&#x20;       batch = tf.expand\_dims(img, axis=0)



&#x20;       pred = auto\_gap\_model.predict(batch, verbose=0)\[0]



&#x20;       left\_norm\_raw = float(pred\[0])

&#x20;       right\_norm\_raw = float(pred\[1])



&#x20;       left\_norm = float(np.clip(left\_norm\_raw, 0.0, 1.0))

&#x20;       right\_norm = float(np.clip(right\_norm\_raw, 0.0, 1.0))



&#x20;       if left\_norm >= right\_norm:

&#x20;           left\_norm, right\_norm = min(left\_norm, right\_norm), max(left\_norm, right\_norm)

&#x20;           status = "ai\_auto\_prediction\_order\_corrected\_manual\_review"

&#x20;       else:

&#x20;           status = "ai\_auto\_suggested"



&#x20;       left\_pixel = int(round(x\_left + left\_norm \* (x\_right - x\_left)))

&#x20;       right\_pixel = int(round(x\_left + right\_norm \* (x\_right - x\_left)))



&#x20;       if right\_pixel <= left\_pixel:

&#x20;           return None, "ai\_auto\_invalid\_left\_right\_order"



&#x20;       return {

&#x20;           "left\_line\_x": left\_pixel,

&#x20;           "right\_line\_x": right\_pixel,

&#x20;           "left\_norm\_raw": left\_norm\_raw,

&#x20;           "right\_norm\_raw": right\_norm\_raw,

&#x20;           "left\_norm\_used": left\_norm,

&#x20;           "right\_norm\_used": right\_norm

&#x20;       }, status



&#x20;   except Exception as e:

&#x20;       return None, f"ai\_auto\_prediction\_failed: {str(e)}"



\# =========================================================

\# CALIBRATION PRESET MEMORY

\# Save / Load / Clear calibration preset เพื่อลดการปรับแกนซ้ำ

\# =========================================================



def read\_calibration\_preset\_table():

&#x20;   if os.path.exists(CALIBRATION\_PRESET\_CSV):

&#x20;       return pd.read\_csv(CALIBRATION\_PRESET\_CSV)



&#x20;   return pd.DataFrame(columns=\[

&#x20;       "preset\_name",

&#x20;       "image\_width",

&#x20;       "image\_height",

&#x20;       "x\_left\_0deg",

&#x20;       "x\_right\_360deg",

&#x20;       "y\_top\_plot",

&#x20;       "y\_bottom\_plot",

&#x20;       "saved\_time",

&#x20;       "example\_prpd\_filename",

&#x20;       "example\_tf\_filename",

&#x20;       "remark"

&#x20;   ])





def make\_default\_preset\_name():

&#x20;   return "PDProcessingII\_or\_CMD\_default"





def find\_matching\_calibration\_preset(image\_width, image\_height, preset\_name=None):

&#x20;   df = read\_calibration\_preset\_table()



&#x20;   if len(df) == 0:

&#x20;       return None



&#x20;   df\_use = df\[

&#x20;       (df\["image\_width"].astype(int) == int(image\_width)) \&

&#x20;       (df\["image\_height"].astype(int) == int(image\_height))

&#x20;   ].copy()



&#x20;   if preset\_name is not None:

&#x20;       df\_use = df\_use\[df\_use\["preset\_name"].astype(str) == str(preset\_name)].copy()



&#x20;   if len(df\_use) == 0:

&#x20;       return None



&#x20;   df\_use = df\_use.sort\_values(by="saved\_time", ascending=False).reset\_index(drop=True)

&#x20;   return df\_use.iloc\[0].to\_dict()





def save\_calibration\_preset\_to\_csv():

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return None, "no\_image\_loaded"



&#x20;   w = state\["image\_width"]

&#x20;   h = state\["image\_height"]

&#x20;   preset\_name = make\_default\_preset\_name()



&#x20;   df\_old = read\_calibration\_preset\_table()



&#x20;   if len(df\_old) > 0:

&#x20;       df\_old = df\_old\[

&#x20;           \~(

&#x20;               (df\_old\["preset\_name"].astype(str) == str(preset\_name)) \&

&#x20;               (df\_old\["image\_width"].astype(int) == int(w)) \&

&#x20;               (df\_old\["image\_height"].astype(int) == int(h))

&#x20;           )

&#x20;       ].copy()



&#x20;   row = {

&#x20;       "preset\_name": preset\_name,

&#x20;       "image\_width": int(w),

&#x20;       "image\_height": int(h),

&#x20;       "x\_left\_0deg": int(x\_left\_slider.value),

&#x20;       "x\_right\_360deg": int(x\_right\_slider.value),

&#x20;       "y\_top\_plot": int(y\_top\_slider.value),

&#x20;       "y\_bottom\_plot": int(y\_bottom\_slider.value),

&#x20;       "saved\_time": now\_str(),

&#x20;       "example\_prpd\_filename": state.get("prpd\_filename", ""),

&#x20;       "example\_tf\_filename": state.get("tf\_filename", ""),

&#x20;       "remark": "saved\_from\_CMD\_final\_topclass\_rule\_v2"

&#x20;   }



&#x20;   df\_new = pd.concat(\[df\_old, pd.DataFrame(\[row])], ignore\_index=True)

&#x20;   df\_new.to\_csv(CALIBRATION\_PRESET\_CSV, index=False)



&#x20;   return row, "saved"





def apply\_calibration\_preset(preset):

&#x20;   if preset is None:

&#x20;       return False



&#x20;   x\_left\_slider.value = int(preset\["x\_left\_0deg"])

&#x20;   x\_right\_slider.value = int(preset\["x\_right\_360deg"])

&#x20;   y\_top\_slider.value = int(preset\["y\_top\_plot"])

&#x20;   y\_bottom\_slider.value = int(preset\["y\_bottom\_plot"])



&#x20;   calibration\_mode\_dropdown.value = "Manual calibration"



&#x20;   state\["calibration\_source"] = "saved\_calibration\_preset"

&#x20;   state\["calibration\_preset\_loaded"] = True



&#x20;   return True



\# =========================================================

\# INPUT VALIDATION / ABSTRACT CHECK

\# ตรวจไฟล์ input และเช็คว่าเป็น Abstract case หรือ External case

\# =========================================================



def validate\_input(prpd\_filename, prpd\_rgb, tf\_filename=None, tf\_rgb=None):

&#x20;   warnings = \[]

&#x20;   errors = \[]



&#x20;   prpd\_ext\_ok = file\_ext\_ok(prpd\_filename)

&#x20;   tf\_ext\_ok = True if tf\_filename in \[None, ""] else file\_ext\_ok(tf\_filename)



&#x20;   if not prpd\_ext\_ok:

&#x20;       errors.append("PRPD file extension is not supported. Use jpg/jpeg/png/bmp.")



&#x20;   if tf\_filename not in \[None, ""] and not tf\_ext\_ok:

&#x20;       errors.append("TF Map file extension is not supported. Use jpg/jpeg/png/bmp.")



&#x20;   prpd\_name\_check = filename\_suggests\_prpd(prpd\_filename)

&#x20;   tf\_name\_check = None



&#x20;   if prpd\_name\_check is False:

&#x20;       warnings.append("PRPD filename appears inconsistent with PRPD input field.")



&#x20;   if prpd\_name\_check is None:

&#x20;       warnings.append("PRPD filename does not clearly indicate PRPD/Pattern.")



&#x20;   pair\_match = None



&#x20;   if tf\_filename not in \[None, ""]:

&#x20;       tf\_name\_check = filename\_suggests\_tf(tf\_filename)



&#x20;       if tf\_name\_check is False:

&#x20;           warnings.append("TF Map filename appears inconsistent with TF input field.")



&#x20;       if tf\_name\_check is None:

&#x20;           warnings.append("TF Map filename does not clearly indicate TF/TWMap.")



&#x20;       prpd\_key = extract\_case\_key(prpd\_filename)

&#x20;       tf\_key = extract\_case\_key(tf\_filename)



&#x20;       pair\_match = prpd\_key == tf\_key



&#x20;       if not pair\_match:

&#x20;           warnings.append(f"PRPD/TF filename pair may not match: PRPD key={prpd\_key}, TF key={tf\_key}")



&#x20;   h, w = prpd\_rgb.shape\[:2]



&#x20;   img\_bgr = cv2.cvtColor(prpd\_rgb, cv2.COLOR\_RGB2BGR)

&#x20;   x\_left, x\_right, y\_top, y\_bottom, frame\_status, plot\_area\_ratio = detect\_prpd\_plot\_frame(img\_bgr)



&#x20;   plot\_frame\_detected = frame\_status == "auto\_contour\_detected"



&#x20;   if not plot\_frame\_detected:

&#x20;       warnings.append("PRPD plot frame could not be reliably detected. Manual calibration may be required.")



&#x20;   plot\_area\_status = "unknown"



&#x20;   if not np.isnan(plot\_area\_ratio):

&#x20;       if plot\_area\_ratio < 0.35:

&#x20;           plot\_area\_status = "plot\_area\_too\_small"

&#x20;           warnings.append("PRPD plot area appears small. Direct exported image is recommended.")

&#x20;       elif plot\_area\_ratio > 0.85:

&#x20;           plot\_area\_status = "plot\_area\_too\_large"

&#x20;           warnings.append("PRPD plot area appears unusually large or cropped.")

&#x20;       else:

&#x20;           plot\_area\_status = "acceptable"



&#x20;   default\_size\_match = (w == DEFAULT\_IMAGE\_WIDTH and h == DEFAULT\_IMAGE\_HEIGHT)



&#x20;   if not default\_size\_match:

&#x20;       warnings.append(

&#x20;           f"PRPD image size is {w}x{h}, not default {DEFAULT\_IMAGE\_WIDTH}x{DEFAULT\_IMAGE\_HEIGHT}. "

&#x20;           "Calibration preset or manual calibration may be required."

&#x20;       )



&#x20;   status = "PASS"



&#x20;   if len(errors) > 0:

&#x20;       status = "FAIL"

&#x20;   elif len(warnings) > 0:

&#x20;       status = "WARNING"



&#x20;   return {

&#x20;       "input\_check\_status": status,

&#x20;       "errors": errors,

&#x20;       "warnings": warnings,

&#x20;       "input\_has\_warning": len(warnings) > 0,

&#x20;       "input\_warning\_count": len(warnings),

&#x20;       "input\_warnings": " | ".join(warnings),

&#x20;       "prpd\_filename\_check": prpd\_name\_check,

&#x20;       "tf\_filename\_check": tf\_name\_check,

&#x20;       "pair\_filename\_match": pair\_match,

&#x20;       "image\_width": w,

&#x20;       "image\_height": h,

&#x20;       "default\_size\_match": default\_size\_match,

&#x20;       "plot\_frame\_detected": plot\_frame\_detected,

&#x20;       "plot\_area\_ratio": plot\_area\_ratio,

&#x20;       "plot\_area\_status": plot\_area\_status,

&#x20;       "detected\_x\_left": x\_left,

&#x20;       "detected\_x\_right": x\_right,

&#x20;       "detected\_y\_top": y\_top,

&#x20;       "detected\_y\_bottom": y\_bottom,

&#x20;       "detected\_frame\_status": frame\_status,

&#x20;       "requires\_manual\_confirmation": len(warnings) > 0

&#x20;   }





def check\_abstract\_case(prpd\_filename, tf\_filename=""):

&#x20;   if df\_mapping is None or len(df\_mapping) == 0:

&#x20;       return {

&#x20;           "is\_abstract\_case": False,

&#x20;           "abstract\_case\_id": "",

&#x20;           "abstract\_defect\_id": "",

&#x20;           "abstract\_defect\_name": "",

&#x20;           "abstract\_match\_method": "mapping\_not\_available",

&#x20;           "mapping\_row": None

&#x20;       }



&#x20;   prpd\_base = os.path.basename(str(prpd\_filename))

&#x20;   prpd\_key = extract\_case\_key(prpd\_base)



&#x20;   df = df\_mapping.copy()



&#x20;   if "output\_prpd\_filename" in df.columns:

&#x20;       exact = df\[df\["output\_prpd\_filename"].astype(str) == prpd\_base]

&#x20;       if len(exact) > 0:

&#x20;           row = exact.iloc\[0]

&#x20;           return build\_abstract\_info\_from\_row(row, "exact\_output\_prpd\_filename")



&#x20;   if "case\_base\_name" in df.columns:

&#x20;       df\["case\_key"] = df\["case\_base\_name"].astype(str).apply(extract\_case\_key)

&#x20;       matched = df\[df\["case\_key"] == prpd\_key]

&#x20;       if len(matched) > 0:

&#x20;           row = matched.iloc\[0]

&#x20;           return build\_abstract\_info\_from\_row(row, "case\_key\_match")



&#x20;   if "output\_prpd\_path" in df.columns:

&#x20;       df\["output\_prpd\_key"] = df\["output\_prpd\_path"].astype(str).apply(lambda x: extract\_case\_key(os.path.basename(x)))

&#x20;       matched = df\[df\["output\_prpd\_key"] == prpd\_key]

&#x20;       if len(matched) > 0:

&#x20;           row = matched.iloc\[0]

&#x20;           return build\_abstract\_info\_from\_row(row, "output\_prpd\_path\_key\_match")



&#x20;   return {

&#x20;       "is\_abstract\_case": False,

&#x20;       "abstract\_case\_id": "",

&#x20;       "abstract\_defect\_id": "",

&#x20;       "abstract\_defect\_name": "",

&#x20;       "abstract\_match\_method": "not\_matched",

&#x20;       "mapping\_row": None

&#x20;   }





def build\_abstract\_info\_from\_row(row, method):

&#x20;   return {

&#x20;       "is\_abstract\_case": True,

&#x20;       "abstract\_case\_id": row.get("case\_base\_name", ""),

&#x20;       "abstract\_defect\_id": row.get("defect\_id", ""),

&#x20;       "abstract\_defect\_name": row.get("defect\_name", ""),

&#x20;       "abstract\_match\_method": method,

&#x20;       "mapping\_row": row

&#x20;   }



\# =========================================================

\# EXCEL REVIEW OUTPUT

\# Save Excel พร้อมรูป annotated Gap-time และค่าที่ต้องใช้ review

\# =========================================================



EXCEL\_COLUMNS = \[

&#x20;   "record\_id",

&#x20;   "case\_base\_name",

&#x20;   "prpd\_filename",

&#x20;   "tf\_filename",



&#x20;   "image\_preview",

&#x20;   "annotated\_image\_path",



&#x20;   "ai\_confidence\_corona",

&#x20;   "ai\_confidence\_surface",

&#x20;   "ai\_confidence\_internal",

&#x20;   "ai\_top\_class",

&#x20;   "ai\_top\_score\_percent",

&#x20;   "ai\_final\_result",

&#x20;   "ai\_final\_score\_percent",

&#x20;   "ai\_status",

&#x20;   "ai\_decision\_rule",

&#x20;   "ai\_threshold\_percent",



&#x20;   "suggested\_pd\_source\_type",

&#x20;   "confirmed\_pd\_source\_type",



&#x20;   "gap\_angle\_deg",

&#x20;   "gap\_time\_ms",

&#x20;   "gap\_time\_band",

&#x20;   "severity\_by\_gap\_time",



&#x20;   "final\_left\_line\_pixel",

&#x20;   "final\_right\_line\_pixel",

&#x20;   "left\_phase\_deg",

&#x20;   "right\_phase\_deg",



&#x20;   "gap\_measurement\_status",

&#x20;   "not\_measurable\_reason",



&#x20;   "review\_status",

&#x20;   "reviewer\_name",

&#x20;   "reviewer\_role",

&#x20;   "review\_note",



&#x20;   "is\_abstract\_case",

&#x20;   "abstract\_defect\_id",

&#x20;   "abstract\_defect\_name",



&#x20;   "result\_folder",

&#x20;   "original\_prpd\_path",

&#x20;   "original\_tf\_path",

&#x20;   "per\_image\_csv\_path",



&#x20;   "created\_time",

&#x20;   "updated\_time",

]





def init\_review\_excel(excel\_path):

&#x20;   if os.path.exists(excel\_path):

&#x20;       return



&#x20;   wb = Workbook()

&#x20;   ws = wb.active

&#x20;   ws.title = "GapTimeReview"



&#x20;   ws.append(EXCEL\_COLUMNS)



&#x20;   header\_fill = PatternFill("solid", fgColor="D9EAF7")

&#x20;   header\_font = Font(bold=True)

&#x20;   thin = Side(border\_style="thin", color="999999")



&#x20;   for cell in ws\[1]:

&#x20;       cell.fill = header\_fill

&#x20;       cell.font = header\_font

&#x20;       cell.alignment = Alignment(horizontal="center", vertical="center", wrap\_text=True)

&#x20;       cell.border = Border(top=thin, bottom=thin, left=thin, right=thin)



&#x20;   widths = {

&#x20;       "A": 20, "B": 24, "C": 28, "D": 28,

&#x20;       "E": 22, "F": 48,

&#x20;       "G": 16, "H": 16, "I": 16,

&#x20;       "J": 16, "K": 18, "L": 18, "M": 18,

&#x20;       "N": 28, "O": 28, "P": 16,

&#x20;       "Q": 30, "R": 30,

&#x20;       "S": 16, "T": 14, "U": 14, "V": 18,

&#x20;       "W": 18, "X": 18, "Y": 18, "Z": 18,

&#x20;       "AA": 22, "AB": 24,

&#x20;       "AC": 18, "AD": 20, "AE": 18, "AF": 30,

&#x20;       "AG": 16, "AH": 18, "AI": 28,

&#x20;       "AJ": 44, "AK": 44, "AL": 44, "AM": 44,

&#x20;       "AN": 22, "AO": 22

&#x20;   }



&#x20;   for col, width in widths.items():

&#x20;       ws.column\_dimensions\[col].width = width



&#x20;   ws.freeze\_panes = "A2"

&#x20;   wb.save(excel\_path)





def append\_result\_to\_excel(row, excel\_path=MASTER\_EXCEL\_PATH):

&#x20;   init\_review\_excel(excel\_path)



&#x20;   wb = load\_workbook(excel\_path)

&#x20;   ws = wb\["GapTimeReview"]



&#x20;   next\_row = ws.max\_row + 1



&#x20;   excel\_row = dict(row)

&#x20;   excel\_row\["image\_preview"] = "Image"



&#x20;   ws.append(\[excel\_row.get(col, "") for col in EXCEL\_COLUMNS])

&#x20;   ws.row\_dimensions\[next\_row].height = 95



&#x20;   for cell in ws\[next\_row]:

&#x20;       cell.alignment = Alignment(horizontal="center", vertical="center", wrap\_text=True)



&#x20;   annotated\_path = row.get("annotated\_image\_path", "")



&#x20;   if annotated\_path and os.path.exists(annotated\_path):

&#x20;       img\_cell = f"E{next\_row}"

&#x20;       ws\[img\_cell] = "Image"

&#x20;       ws\[img\_cell].hyperlink = annotated\_path

&#x20;       ws\[img\_cell].style = "Hyperlink"



&#x20;       try:

&#x20;           img = XLImage(annotated\_path)

&#x20;           img.width = 150

&#x20;           img.height = 95

&#x20;           ws.add\_image(img, img\_cell)

&#x20;       except Exception as e:

&#x20;           print("WARNING: Cannot embed image into Excel:", e)



&#x20;   wb.save(excel\_path)





def append\_result\_to\_reviewer\_excel(row):

&#x20;   reviewer\_name = row.get("reviewer\_name", "unknown\_reviewer")

&#x20;   reviewer\_name = reviewer\_name if str(reviewer\_name).strip() != "" else "unknown\_reviewer"



&#x20;   reviewer\_dir = os.path.join(REVIEWER\_ROOT\_DIR, safe\_text\_name(reviewer\_name))

&#x20;   reviewer\_excel\_dir = os.path.join(reviewer\_dir, "excel")

&#x20;   os.makedirs(reviewer\_excel\_dir, exist\_ok=True)



&#x20;   reviewer\_excel = os.path.join(

&#x20;       reviewer\_excel\_dir,

&#x20;       f"CMD\_gap\_time\_review\_results\_{safe\_text\_name(reviewer\_name)}.xlsx"

&#x20;   )



&#x20;   append\_result\_to\_excel(row, reviewer\_excel)

&#x20;   return reviewer\_excel



\# =========================================================

\# WIDGETS - DARK MODE READABLE ENGLISH UI

\# ส่วน UI/output ที่แสดงให้ผู้ใช้เห็น ใช้ English ล้วนและสีอ่านง่ายบน dark mode

\# =========================================================



notice\_html = widgets.HTML("""

<div style="

&#x20;   border: 2px solid #f59e0b;

&#x20;   background: #1f2937;

&#x20;   color: #f9fafb;

&#x20;   padding: 14px;

&#x20;   border-radius: 10px;

&#x20;   line-height: 1.65;

&#x20;   margin-bottom: 10px;

&#x20;   font-size: 15px;

">

<b style="color:#fbbf24;">Input Notice / Usage Limitation</b><br><br>



This system was developed and validated primarily using PRPD and TF Map images exported from

<b>PDProcessingII version 1.00.23</b>.<br><br>



For reliable analysis, the PRPD plot region should be clearly visible and should occupy approximately

<b>70–80% of the image area</b>. Images with excessive margins, cropped axes, distorted scaling, or abnormal visualization settings may reduce the reliability of the result.<br><br>



Uploading both <b>PRPD</b> and <b>TF Map</b> is recommended for Hybrid analysis. PRPD-only analysis is available, but the result should be interpreted with additional caution.<br><br>



If the input images are generated from other software, uploaded into the wrong field, mismatched between PRPD and TF Map, or visually inconsistent with the expected format, the result should be manually verified before interpretation.<br><br>



<b style="color:#93c5fd;">Important:</b> This system is intended for <b>preliminary assessment</b> and <b>decision support</b>. Final interpretation should be confirmed by an experienced operator or expert.

</div>

""")



prpd\_upload = widgets.FileUpload(

&#x20;   accept=".jpg,.jpeg,.png,.bmp",

&#x20;   multiple=False,

&#x20;   description="Upload PRPD"

)



tf\_upload = widgets.FileUpload(

&#x20;   accept=".jpg,.jpeg,.png,.bmp",

&#x20;   multiple=False,

&#x20;   description="Upload TF Map"

)



confirm\_warning\_checkbox = widgets.Checkbox(

&#x20;   value=False,

&#x20;   description="I confirm the input warnings and want to continue",

&#x20;   indent=False,

&#x20;   layout=widgets.Layout(width="520px")

)



run\_button = widgets.Button(

&#x20;   description="Confirm Input and Run AI",

&#x20;   button\_style="primary",

&#x20;   layout=widgets.Layout(width="260px")

)



input\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="1px solid #777",

&#x20;       padding="6px",

&#x20;       height="300px",

&#x20;       overflow\_y="auto"

&#x20;   )

)



ai\_locked\_panel = widgets.HTML("""

<div style="

&#x20;   position: sticky;

&#x20;   top: 0;

&#x20;   z-index: 999;

&#x20;   background: #111827;

&#x20;   color: #f9fafb;

&#x20;   border: 2px solid #38bdf8;

&#x20;   border-radius: 10px;

&#x20;   padding: 12px;

&#x20;   margin: 8px 0;

&#x20;   font-size: 15px;

&#x20;   line-height: 1.55;

">

<b style="color:#7dd3fc;">AI RESULT PANEL:</b> AI has not been executed yet.

</div>

""")



status\_html = widgets.HTML("<b>Status:</b> No case loaded yet")



calibration\_mode\_dropdown = widgets.Dropdown(

&#x20;   options=\[

&#x20;       "Use saved calibration preset",

&#x20;       "Use default PDProcessingII calibration",

&#x20;       "Use auto-detected calibration",

&#x20;       "Manual calibration"

&#x20;   ],

&#x20;   value="Use auto-detected calibration",

&#x20;   description="Calibration mode:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="560px")

)



x\_left\_slider = widgets.IntSlider(description="0 deg", continuous\_update=False, layout=widgets.Layout(width="520px"))

x\_right\_slider = widgets.IntSlider(description="360 deg", continuous\_update=False, layout=widgets.Layout(width="520px"))

y\_top\_slider = widgets.IntSlider(description="Y top", continuous\_update=False, layout=widgets.Layout(width="520px"))

y\_bottom\_slider = widgets.IntSlider(description="Y bottom", continuous\_update=False, layout=widgets.Layout(width="520px"))



left\_line\_slider = widgets.IntSlider(description="Left line", continuous\_update=False, layout=widgets.Layout(width="520px"))

right\_line\_slider = widgets.IntSlider(description="Right line", continuous\_update=False, layout=widgets.Layout(width="520px"))



btn\_x\_left\_minus = widgets.Button(description="0° -1")

btn\_x\_left\_plus = widgets.Button(description="0° +1")

btn\_x\_right\_minus = widgets.Button(description="360° -1")

btn\_x\_right\_plus = widgets.Button(description="360° +1")



btn\_y\_top\_minus = widgets.Button(description="Y top -1")

btn\_y\_top\_plus = widgets.Button(description="Y top +1")

btn\_y\_bottom\_minus = widgets.Button(description="Y bottom -1")

btn\_y\_bottom\_plus = widgets.Button(description="Y bottom +1")



btn\_left\_minus = widgets.Button(description="Left -1", button\_style="warning")

btn\_left\_plus = widgets.Button(description="Left +1", button\_style="warning")

btn\_right\_minus = widgets.Button(description="Right -1", button\_style="success")

btn\_right\_plus = widgets.Button(description="Right +1", button\_style="success")



btn\_redetect = widgets.Button(description="Re-detect Gap Lines", button\_style="info")

btn\_auto\_gap = widgets.Button(description="Use AI Auto Gap Suggestion", button\_style="info")



save\_calib\_button = widgets.Button(description="Save Calibration Preset", button\_style="success")

load\_calib\_button = widgets.Button(description="Load Calibration Preset", button\_style="info")

clear\_calib\_button = widgets.Button(description="Clear Calibration Preset", button\_style="danger")



calibration\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="1px solid #888",

&#x20;       padding="6px",

&#x20;       height="180px",

&#x20;       overflow\_y="auto"

&#x20;   )

)



pd\_source\_dropdown = widgets.Dropdown(

&#x20;   options=PD\_SOURCE\_OPTIONS,

&#x20;   value="Outside surface discharge",

&#x20;   description="PD source:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="620px")

)



review\_status\_dropdown = widgets.Dropdown(

&#x20;   options=REVIEW\_STATUS\_OPTIONS,

&#x20;   value="user\_confirmed",

&#x20;   description="Review status:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="420px")

)



reviewer\_name\_text = widgets.Text(

&#x20;   value="",

&#x20;   placeholder="Reviewer name",

&#x20;   description="Reviewer name:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="420px")

)



reviewer\_role\_dropdown = widgets.Dropdown(

&#x20;   options=REVIEWER\_ROLE\_OPTIONS,

&#x20;   value="researcher",

&#x20;   description="Reviewer role:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="420px")

)



review\_note\_text = widgets.Textarea(

&#x20;   value="",

&#x20;   placeholder="Optional review note",

&#x20;   description="Review note:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="780px", height="80px")

)



not\_measurable\_reason\_dropdown = widgets.Dropdown(

&#x20;   options=NOT\_MEASURABLE\_REASON\_OPTIONS,

&#x20;   value="",

&#x20;   description="Not measurable reason:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="520px")

)



btn\_accept = widgets.Button(description="Accept and Save", button\_style="success", layout=widgets.Layout(width="200px"))

btn\_not\_measurable = widgets.Button(description="Not Measurable", button\_style="danger", layout=widgets.Layout(width="200px"))



plot\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="2px solid #00bcd4",

&#x20;       padding="6px",

&#x20;       height="620px",

&#x20;       overflow\_y="auto"

&#x20;   )

)



\# =========================================================

\# UI UPDATE FUNCTIONS

\# อัปเดต LOCKED AI RESULT PANEL และ status panel

\# =========================================================



def update\_ai\_locked\_panel():

&#x20;   if state.get("ai\_result") is None:

&#x20;       ai\_locked\_panel.value = """

&#x20;       <div style="

&#x20;           position: sticky;

&#x20;           top: 0;

&#x20;           z-index: 999;

&#x20;           background: #111827;

&#x20;           color: #f9fafb;

&#x20;           border: 2px solid #38bdf8;

&#x20;           border-radius: 10px;

&#x20;           padding: 12px;

&#x20;           margin: 8px 0;

&#x20;           font-size: 15px;

&#x20;           line-height: 1.55;

&#x20;       ">

&#x20;       <b style="color:#7dd3fc;">AI RESULT PANEL:</b> AI has not been executed yet.

&#x20;       </div>

&#x20;       """

&#x20;       return



&#x20;   ai = state\["ai\_result"]

&#x20;   cd = ai\["confidence\_dict"]



&#x20;   corona = cd.get("Corona", 0.0)

&#x20;   surface = cd.get("Surface", 0.0)

&#x20;   internal = cd.get("Internal", 0.0)



&#x20;   strong\_text = "STRONG RULE" if ai.get("is\_strong\_pd\_rule", False) else "TOP CLASS FALLBACK / MANUAL CONFIRM"

&#x20;   ai\_display = make\_ai\_display\_text(ai)



&#x20;   ai\_locked\_panel.value = f"""

&#x20;   <div style="

&#x20;       position: sticky;

&#x20;       top: 0;

&#x20;       z-index: 999;

&#x20;       background: #111827;

&#x20;       color: #f9fafb;

&#x20;       border: 2px solid #38bdf8;

&#x20;       border-radius: 10px;

&#x20;       padding: 12px;

&#x20;       margin: 8px 0;

&#x20;       font-size: 15px;

&#x20;       line-height: 1.55;

&#x20;   ">

&#x20;       <div style="font-size:18px; font-weight:700; color:#7dd3fc;">

&#x20;           LOCKED AI RESULT

&#x20;       </div>



&#x20;       <b>PRPD:</b> {state.get("prpd\_filename", "")}<br>

&#x20;       <b>TF:</b> {state.get("tf\_filename", "") if state.get("tf\_filename", "") else "Not provided"}<br>

&#x20;       <b>Input mode:</b> {ai\["input\_mode"]}<br>

&#x20;       <b>Model used:</b> {ai\["model\_used"]}<br>



&#x20;       <hr style="border:0; border-top:1px solid #334155; margin:8px 0;">



&#x20;       <b>AI display:</b> {ai\_display}<br>

&#x20;       <b>AI final result:</b> {ai\["final\_result"]}<br>

&#x20;       <b>AI status:</b> {ai\["status"]}<br>

&#x20;       <b>Decision rule:</b> {ai.get("ai\_decision\_rule", "")}<br>

&#x20;       <b>Threshold:</b> {ai.get("ai\_threshold\_percent", TOPCLASS\_THRESHOLD):.2f}%<br>

&#x20;       <b>Top class:</b> {ai\["top\_class"]} ({ai\["top\_score"]:.2f}%)<br>



&#x20;       <hr style="border:0; border-top:1px solid #334155; margin:8px 0;">



&#x20;       <b>Corona:</b> {corona:.2f}% {make\_percent\_bar(corona)}<br>

&#x20;       <b>Surface:</b> {surface:.2f}% {make\_percent\_bar(surface)}<br>

&#x20;       <b>Internal:</b> {internal:.2f}% {make\_percent\_bar(internal)}<br>



&#x20;       <hr style="border:0; border-top:1px solid #334155; margin:8px 0;">



&#x20;       <b>PD rule class:</b> {ai\["pd\_rule\_class"]}<br>

&#x20;       <b>PD selection rule:</b> {ai\["pd\_selection\_rule"]}<br>

&#x20;       <b>Rule type:</b> {strong\_text}<br>

&#x20;       <b>Suggested PD source:</b>

&#x20;       <span style="color:#facc15; font-weight:700;">

&#x20;           {ai\["suggested\_pd\_source"]}

&#x20;       </span>

&#x20;   </div>

&#x20;   """





def update\_status\_html():

&#x20;   abstract\_info = state.get("abstract\_info", {}) or {}

&#x20;   case\_type = "Abstract CMD case" if abstract\_info.get("is\_abstract\_case", False) else "External / non-Abstract case"



&#x20;   status\_html.value = (

&#x20;       f"<b>Status:</b><br>"

&#x20;       f"<b>Loaded:</b> {state.get('prpd\_filename', '')}"

&#x20;       f"{' + ' + state.get('tf\_filename', '') if state.get('tf\_filename', '') else ''}<br>"

&#x20;       f"<b>Case type:</b> {case\_type}<br>"

&#x20;       f"<b>Calibration source:</b> {state.get('calibration\_source', '')}<br>"

&#x20;       f"<b>Auto Gap status:</b> {state.get('auto\_gap\_status', '')}<br>"

&#x20;       f"<b>Initial line source:</b> {state.get('initial\_line\_source', '')}"

&#x20;   )



\# =========================================================

\# CALIBRATION SETUP / AUTO GAP APPLY

\# ตั้งค่า slider, calibration mode และเรียกใช้ AI/rule-based gap suggestion

\# =========================================================



def setup\_sliders\_after\_input():

&#x20;   img\_rgb = state\["prpd\_rgb"]

&#x20;   h, w = img\_rgb.shape\[:2]



&#x20;   state\["image\_width"] = w

&#x20;   state\["image\_height"] = h

&#x20;   state\["default\_size\_match"] = (w == DEFAULT\_IMAGE\_WIDTH and h == DEFAULT\_IMAGE\_HEIGHT)



&#x20;   input\_quality = state\["input\_quality"]



&#x20;   auto\_x\_left = int(input\_quality\["detected\_x\_left"])

&#x20;   auto\_x\_right = int(input\_quality\["detected\_x\_right"])

&#x20;   auto\_y\_top = int(input\_quality\["detected\_y\_top"])

&#x20;   auto\_y\_bottom = int(input\_quality\["detected\_y\_bottom"])

&#x20;   auto\_status = input\_quality\["detected\_frame\_status"]



&#x20;   state\["auto\_x\_left"] = auto\_x\_left

&#x20;   state\["auto\_x\_right"] = auto\_x\_right

&#x20;   state\["auto\_y\_top"] = auto\_y\_top

&#x20;   state\["auto\_y\_bottom"] = auto\_y\_bottom

&#x20;   state\["auto\_calibration\_status"] = auto\_status



&#x20;   for slider in \[x\_left\_slider, x\_right\_slider, left\_line\_slider, right\_line\_slider]:

&#x20;       slider.min = 0

&#x20;       slider.max = w - 1

&#x20;       slider.step = 1



&#x20;   for slider in \[y\_top\_slider, y\_bottom\_slider]:

&#x20;       slider.min = 0

&#x20;       slider.max = h - 1

&#x20;       slider.step = 1



&#x20;   preset = find\_matching\_calibration\_preset(

&#x20;       image\_width=w,

&#x20;       image\_height=h,

&#x20;       preset\_name=make\_default\_preset\_name()

&#x20;   )



&#x20;   if preset is not None:

&#x20;       calibration\_mode\_dropdown.value = "Use saved calibration preset"

&#x20;       x\_left = int(preset\["x\_left\_0deg"])

&#x20;       x\_right = int(preset\["x\_right\_360deg"])

&#x20;       y\_top = int(preset\["y\_top\_plot"])

&#x20;       y\_bottom = int(preset\["y\_bottom\_plot"])

&#x20;       state\["calibration\_source"] = "saved\_calibration\_preset\_auto\_loaded"

&#x20;       state\["calibration\_preset\_loaded"] = True



&#x20;   elif state\["default\_size\_match"]:

&#x20;       calibration\_mode\_dropdown.value = "Use default PDProcessingII calibration"

&#x20;       x\_left = DEFAULT\_X\_LEFT

&#x20;       x\_right = DEFAULT\_X\_RIGHT

&#x20;       y\_top = DEFAULT\_Y\_TOP

&#x20;       y\_bottom = DEFAULT\_Y\_BOTTOM

&#x20;       state\["calibration\_source"] = "default\_PDProcessingII"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   else:

&#x20;       calibration\_mode\_dropdown.value = "Use auto-detected calibration"

&#x20;       x\_left = auto\_x\_left

&#x20;       x\_right = auto\_x\_right

&#x20;       y\_top = auto\_y\_top

&#x20;       y\_bottom = auto\_y\_bottom

&#x20;       state\["calibration\_source"] = "auto\_detected\_plot\_frame"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   x\_left\_slider.value = int(x\_left)

&#x20;   x\_right\_slider.value = int(x\_right)

&#x20;   y\_top\_slider.value = int(y\_top)

&#x20;   y\_bottom\_slider.value = int(y\_bottom)



&#x20;   left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;   right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))





def apply\_calibration\_mode(change=None):

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   mode = calibration\_mode\_dropdown.value



&#x20;   if mode == "Use saved calibration preset":

&#x20;       preset = find\_matching\_calibration\_preset(

&#x20;           image\_width=state\["image\_width"],

&#x20;           image\_height=state\["image\_height"],

&#x20;           preset\_name=make\_default\_preset\_name()

&#x20;       )

&#x20;       if preset is not None:

&#x20;           apply\_calibration\_preset(preset)

&#x20;       else:

&#x20;           calibration\_mode\_dropdown.value = "Use auto-detected calibration"

&#x20;           return



&#x20;   elif mode == "Use default PDProcessingII calibration":

&#x20;       if not state\["default\_size\_match"]:

&#x20;           calibration\_mode\_dropdown.value = "Use auto-detected calibration"

&#x20;           return



&#x20;       x\_left\_slider.value = DEFAULT\_X\_LEFT

&#x20;       x\_right\_slider.value = DEFAULT\_X\_RIGHT

&#x20;       y\_top\_slider.value = DEFAULT\_Y\_TOP

&#x20;       y\_bottom\_slider.value = DEFAULT\_Y\_BOTTOM



&#x20;       state\["calibration\_source"] = "default\_PDProcessingII"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   elif mode == "Use auto-detected calibration":

&#x20;       x\_left\_slider.value = int(state\["auto\_x\_left"])

&#x20;       x\_right\_slider.value = int(state\["auto\_x\_right"])

&#x20;       y\_top\_slider.value = int(state\["auto\_y\_top"])

&#x20;       y\_bottom\_slider.value = int(state\["auto\_y\_bottom"])



&#x20;       state\["calibration\_source"] = "auto\_detected\_plot\_frame"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   elif mode == "Manual calibration":

&#x20;       if state.get("calibration\_source", "") == "":

&#x20;           state\["calibration\_source"] = "manual\_calibration"



&#x20;   update\_status\_html()

&#x20;   draw\_all()



calibration\_mode\_dropdown.observe(apply\_calibration\_mode, names="value")





def use\_ai\_auto\_gap\_suggestion():

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value



&#x20;   result, status = predict\_auto\_gap\_lines\_model(

&#x20;       img\_rgb=state\["prpd\_rgb"],

&#x20;       x\_left=x\_left,

&#x20;       x\_right=x\_right

&#x20;   )



&#x20;   state\["auto\_gap\_status"] = status

&#x20;   state\["auto\_gap\_model\_available"] = auto\_gap\_model is not None

&#x20;   state\["auto\_gap\_model\_path"] = AUTO\_GAP\_MODEL\_PATH if auto\_gap\_model is not None else ""

&#x20;   state\["auto\_gap\_model\_version"] = AUTO\_GAP\_MODEL\_VERSION if auto\_gap\_model is not None else ""



&#x20;   if result is not None:

&#x20;       left\_line\_slider.value = int(result\["left\_line\_x"])

&#x20;       right\_line\_slider.value = int(result\["right\_line\_x"])



&#x20;       state\["auto\_left\_line\_pixel"] = int(result\["left\_line\_x"])

&#x20;       state\["auto\_right\_line\_pixel"] = int(result\["right\_line\_x"])



&#x20;       state\["auto\_left\_phase\_deg"] = pixel\_to\_phase\_deg(result\["left\_line\_x"], x\_left, x\_right)

&#x20;       state\["auto\_right\_phase\_deg"] = pixel\_to\_phase\_deg(result\["right\_line\_x"], x\_left, x\_right)



&#x20;       gap\_angle = state\["auto\_right\_phase\_deg"] - state\["auto\_left\_phase\_deg"]

&#x20;       state\["auto\_gap\_time\_ms"] = gap\_angle\_to\_ms(gap\_angle) if gap\_angle > 0 else np.nan



&#x20;       state\["initial\_line\_source"] = "ai\_auto"

&#x20;   else:

&#x20;       state\["auto\_left\_line\_pixel"] = np.nan

&#x20;       state\["auto\_right\_line\_pixel"] = np.nan

&#x20;       state\["auto\_gap\_time\_ms"] = np.nan

&#x20;       state\["initial\_line\_source"] = "ai\_auto\_failed"



&#x20;   update\_status\_html()

&#x20;   draw\_all()





def use\_rule\_based\_gap\_suggestion():

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   result, status = auto\_detect\_gap\_lines\_rule\_based(

&#x20;       state\["prpd\_rgb"],

&#x20;       x\_left,

&#x20;       x\_right,

&#x20;       y\_top,

&#x20;       y\_bottom

&#x20;   )



&#x20;   state\["rule\_based\_result"] = result

&#x20;   state\["rule\_based\_status"] = status



&#x20;   if result is not None:

&#x20;       left\_line\_slider.value = int(result\["left\_line\_x"])

&#x20;       right\_line\_slider.value = int(result\["right\_line\_x"])

&#x20;       state\["initial\_line\_source"] = "rule\_based\_auto"

&#x20;   else:

&#x20;       state\["initial\_line\_source"] = "manual"

&#x20;       left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;       right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))



&#x20;   update\_status\_html()

&#x20;   draw\_all()





def initialize\_gap\_lines():

&#x20;   # ก่อนใช้ Auto Gap-time ต้องตรวจก่อนว่า pattern มีสอง cluster ให้คำนวณได้หรือไม่

&#x20;   # ถ้าเป็น discharge ฝั่งเดียว ให้ขึ้น Not measurable ตามเกณฑ์อาจารย์

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   rb\_result, rb\_status = auto\_detect\_gap\_lines\_rule\_based(

&#x20;       state\["prpd\_rgb"],

&#x20;       x\_left,

&#x20;       x\_right,

&#x20;       y\_top,

&#x20;       y\_bottom

&#x20;   )



&#x20;   state\["rule\_based\_result"] = rb\_result

&#x20;   state\["rule\_based\_status"] = rb\_status

&#x20;   state\["cluster\_detection\_status"] = rb\_status



&#x20;   if rb\_status.startswith("single\_discharge\_cluster\_detected"):

&#x20;       state\["gap\_not\_measurable\_recommended"] = True

&#x20;       state\["gap\_not\_measurable\_reason"] = "single\_discharge\_cluster"

&#x20;       state\["auto\_gap\_status"] = "skipped\_single\_discharge\_cluster\_not\_measurable"

&#x20;       state\["initial\_line\_source"] = "not\_measurable\_recommended"



&#x20;       not\_measurable\_reason\_dropdown.value = "single\_discharge\_cluster"

&#x20;       review\_status\_dropdown.value = "not\_measurable"



&#x20;       # ตั้งเส้นคร่าว ๆ ไว้เพื่อแสดงภาพเท่านั้น แต่จะไม่ใช้คำนวณ final gap-time

&#x20;       left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;       right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))

&#x20;       update\_status\_html()

&#x20;       draw\_all()

&#x20;       return



&#x20;   if rb\_status == "no\_clear\_discharge\_cluster\_detected":

&#x20;       state\["gap\_not\_measurable\_recommended"] = True

&#x20;       state\["gap\_not\_measurable\_reason"] = "unclear\_prpd\_pattern"

&#x20;       state\["auto\_gap\_status"] = "skipped\_no\_clear\_discharge\_cluster"

&#x20;       state\["initial\_line\_source"] = "not\_measurable\_recommended"

&#x20;       not\_measurable\_reason\_dropdown.value = "unclear\_prpd\_pattern"

&#x20;       review\_status\_dropdown.value = "not\_measurable"

&#x20;       left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;       right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))

&#x20;       update\_status\_html()

&#x20;       draw\_all()

&#x20;       return



&#x20;   # ถ้า rule-based ยืนยันว่าเจอสอง cluster แล้ว ค่อยใช้ AI Auto Gap-time เป็น suggestion ได้

&#x20;   state\["gap\_not\_measurable\_recommended"] = False

&#x20;   state\["gap\_not\_measurable\_reason"] = ""



&#x20;   if auto\_gap\_model is not None:

&#x20;       use\_ai\_auto\_gap\_suggestion()

&#x20;       if "failed" not in state\["auto\_gap\_status"] and "not\_available" not in state\["auto\_gap\_status"]:

&#x20;           return



&#x20;   # ถ้า AI ใช้ไม่ได้ ให้ fallback เป็น rule-based result ที่ตรวจไว้แล้ว

&#x20;   if rb\_result is not None:

&#x20;       left\_line\_slider.value = int(rb\_result\["left\_line\_x"])

&#x20;       right\_line\_slider.value = int(rb\_result\["right\_line\_x"])

&#x20;       state\["initial\_line\_source"] = "rule\_based\_auto"

&#x20;       update\_status\_html()

&#x20;       draw\_all()

&#x20;       return



&#x20;   use\_rule\_based\_gap\_suggestion()



\# =========================================================

\# COMPUTE / DRAW

\# คำนวณผลปัจจุบันและวาดรูป annotated PRPD preview

\# =========================================================



def compute\_current\_result():

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   left\_x = left\_line\_slider.value

&#x20;   right\_x = right\_line\_slider.value



&#x20;   if x\_right <= x\_left or y\_bottom <= y\_top:

&#x20;       return None



&#x20;   # ถ้าระบบตรวจว่าเป็น discharge ฝั่งเดียว ให้ถือว่า Gap-time วัดไม่ได้

&#x20;   if state.get("gap\_not\_measurable\_recommended", False):

&#x20;       return {

&#x20;           "x\_left": x\_left,

&#x20;           "x\_right": x\_right,

&#x20;           "y\_top": y\_top,

&#x20;           "y\_bottom": y\_bottom,

&#x20;           "left\_x": left\_x,

&#x20;           "right\_x": right\_x,

&#x20;           "left\_phase": np.nan,

&#x20;           "right\_phase": np.nan,

&#x20;           "gap\_angle": np.nan,

&#x20;           "gap\_time\_ms": np.nan,

&#x20;           "gap\_band": "Not measurable",

&#x20;           "severity": "Not measurable",

&#x20;           "manual\_adjustment\_detected": False,

&#x20;           "left\_line\_adjustment\_pixel": np.nan,

&#x20;           "right\_line\_adjustment\_pixel": np.nan

&#x20;       }



&#x20;   left\_phase = pixel\_to\_phase\_deg(left\_x, x\_left, x\_right)

&#x20;   right\_phase = pixel\_to\_phase\_deg(right\_x, x\_left, x\_right)



&#x20;   gap\_angle = right\_phase - left\_phase



&#x20;   if gap\_angle <= 0:

&#x20;       gap\_time\_ms = np.nan

&#x20;       gap\_band = "Invalid"

&#x20;       severity = "Invalid lines"

&#x20;   else:

&#x20;       gap\_time\_ms = gap\_angle\_to\_ms(gap\_angle)

&#x20;       gap\_band = gap\_time\_band(gap\_time\_ms)

&#x20;       severity = severity\_from\_gap\_time\_and\_source(

&#x20;           gap\_time\_ms,

&#x20;           pd\_source\_dropdown.value

&#x20;       )



&#x20;   manual\_adjustment\_detected = False

&#x20;   left\_adjust = np.nan

&#x20;   right\_adjust = np.nan



&#x20;   if not np.isnan(state.get("auto\_left\_line\_pixel", np.nan)):

&#x20;       left\_adjust = abs(left\_x - state\["auto\_left\_line\_pixel"])

&#x20;       right\_adjust = abs(right\_x - state\["auto\_right\_line\_pixel"])

&#x20;       manual\_adjustment\_detected = (left\_adjust > 2) or (right\_adjust > 2)



&#x20;   return {

&#x20;       "x\_left": x\_left,

&#x20;       "x\_right": x\_right,

&#x20;       "y\_top": y\_top,

&#x20;       "y\_bottom": y\_bottom,

&#x20;       "left\_x": left\_x,

&#x20;       "right\_x": right\_x,

&#x20;       "left\_phase": left\_phase,

&#x20;       "right\_phase": right\_phase,

&#x20;       "gap\_angle": gap\_angle,

&#x20;       "gap\_time\_ms": gap\_time\_ms,

&#x20;       "gap\_band": gap\_band,

&#x20;       "severity": severity,

&#x20;       "manual\_adjustment\_detected": manual\_adjustment\_detected,

&#x20;       "left\_line\_adjustment\_pixel": left\_adjust,

&#x20;       "right\_line\_adjustment\_pixel": right\_adjust

&#x20;   }





def validate\_gap\_time\_result(result):

&#x20;   if result is None:

&#x20;       return False, "Invalid calibration or missing result."



&#x20;   messages = \[]



&#x20;   if state.get("gap\_not\_measurable\_recommended", False):

&#x20;       return False, "Gap-time is not measurable because only one discharge cluster was detected. Please use the Not Measurable button."



&#x20;   if result\["x\_right"] <= result\["x\_left"]:

&#x20;       messages.append("x\_right\_360deg must be greater than x\_left\_0deg.")



&#x20;   if result\["y\_bottom"] <= result\["y\_top"]:

&#x20;       messages.append("y\_bottom must be greater than y\_top.")



&#x20;   if result\["left\_x"] >= result\["right\_x"]:

&#x20;       messages.append("left\_line must be less than right\_line.")



&#x20;   if not (result\["x\_left"] <= result\["left\_x"] <= result\["x\_right"]):

&#x20;       messages.append("left\_line is outside plot frame.")



&#x20;   if not (result\["x\_left"] <= result\["right\_x"] <= result\["x\_right"]):

&#x20;       messages.append("right\_line is outside plot frame.")



&#x20;   if result\["gap\_angle"] <= 0:

&#x20;       messages.append("gap\_angle must be positive.")



&#x20;   if np.isnan(result\["gap\_time\_ms"]) or result\["gap\_time\_ms"] <= 0 or result\["gap\_time\_ms"] > CYCLE\_TIME\_MS:

&#x20;       messages.append("gap\_time\_ms must be within 0–20 ms.")



&#x20;   if len(messages) > 0:

&#x20;       return False, " | ".join(messages)



&#x20;   return True, "OK"





def draw\_all():

&#x20;   update\_ai\_locked\_panel()

&#x20;   update\_status\_html()



&#x20;   with plot\_output:

&#x20;       clear\_output(wait=True)



&#x20;       if state\["prpd\_rgb"] is None:

&#x20;           print("No PRPD image loaded yet.")

&#x20;           return



&#x20;       result = compute\_current\_result()



&#x20;       if result is None:

&#x20;           print("ERROR: Invalid calibration")

&#x20;           return



&#x20;       img\_rgb = state\["prpd\_rgb"]



&#x20;       x\_left = result\["x\_left"]

&#x20;       x\_right = result\["x\_right"]

&#x20;       y\_top = result\["y\_top"]

&#x20;       y\_bottom = result\["y\_bottom"]



&#x20;       left\_x = result\["left\_x"]

&#x20;       right\_x = result\["right\_x"]



&#x20;       fig, ax = plt.subplots(figsize=(10, 5.6))

&#x20;       ax.imshow(img\_rgb)



&#x20;       rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;       rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;       ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Plot frame")



&#x20;       ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.6, label="0° / 360°")

&#x20;       ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.6)



&#x20;       for phase in \[90, 180, 270]:

&#x20;           ax.axvline(

&#x20;               phase\_deg\_to\_pixel(phase, x\_left, x\_right),

&#x20;               color="gray",

&#x20;               linestyle=":",

&#x20;               linewidth=1.1

&#x20;           )



&#x20;       if state\["rule\_based\_result"] is not None:

&#x20;           rb = state\["rule\_based\_result"]

&#x20;           pos\_l, pos\_r = rb.get("positive\_x\_range\_pixel", (None, None))

&#x20;           neg\_l, neg\_r = rb.get("negative\_x\_range\_pixel", (None, None))



&#x20;           if pos\_l is not None and pos\_r is not None:

&#x20;               ax.axvspan(pos\_l, pos\_r, color="yellow", alpha=0.12, label="positive cluster range")



&#x20;           if neg\_l is not None and neg\_r is not None:

&#x20;               ax.axvspan(neg\_l, neg\_r, color="cyan", alpha=0.12, label="negative cluster range")



&#x20;       if not np.isnan(state.get("auto\_left\_line\_pixel", np.nan)):

&#x20;           ax.axvline(

&#x20;               state\["auto\_left\_line\_pixel"],

&#x20;               color="red",

&#x20;               linestyle=":",

&#x20;               linewidth=1.5,

&#x20;               label="AI suggested left"

&#x20;           )

&#x20;           ax.axvline(

&#x20;               state\["auto\_right\_line\_pixel"],

&#x20;               color="green",

&#x20;               linestyle=":",

&#x20;               linewidth=1.5,

&#x20;               label="AI suggested right"

&#x20;           )



&#x20;       ax.axvline(left\_x, color="red", linewidth=2.8, label="Final left line")

&#x20;       ax.axvline(right\_x, color="green", linewidth=2.8, label="Final right line")



&#x20;       ai\_text = ""

&#x20;       if state\["ai\_result"] is not None:

&#x20;           ai = state\["ai\_result"]

&#x20;           ai\_text = f"{make\_ai\_display\_text(ai)} | "



&#x20;       if state.get("gap\_not\_measurable\_recommended", False):

&#x20;           title\_text = (

&#x20;               f"{state\['prpd\_filename']}\\n"

&#x20;               f"{ai\_text}PD source: {pd\_source\_dropdown.value}\\n"

&#x20;               "Gap-time: Not measurable | Reason: single discharge cluster or unclear cluster pair"

&#x20;           )

&#x20;       else:

&#x20;           title\_text = (

&#x20;               f"{state\['prpd\_filename']}\\n"

&#x20;               f"{ai\_text}PD source: {pd\_source\_dropdown.value}\\n"

&#x20;               f"Gap angle = {result\['gap\_angle']:.2f}° | "

&#x20;               f"Gap time = {result\['gap\_time\_ms']:.2f} ms | "

&#x20;               f"Band = {result\['gap\_band']} | Severity = {result\['severity']}"

&#x20;           )



&#x20;       ax.set\_title(title\_text, fontsize=10)



&#x20;       ax.axis("off")

&#x20;       ax.legend(loc="upper right", fontsize=8)

&#x20;       plt.tight\_layout()

&#x20;       plt.show()



&#x20;       gap\_valid, gap\_msg = validate\_gap\_time\_result(result)



&#x20;       print("=" \* 100)

&#x20;       print("CURRENT RESULT")

&#x20;       print("=" \* 100)

&#x20;       print("PRPD file              :", state\["prpd\_filename"])

&#x20;       print("TF file                :", state\["tf\_filename"] if state\["tf\_filename"] else "Not provided")

&#x20;       print("Case type              :", "Abstract" if state\["abstract\_info"]\["is\_abstract\_case"] else "External")

&#x20;       print("Initial line source    :", state\["initial\_line\_source"])

&#x20;       print("Auto Gap status        :", state\["auto\_gap\_status"])

&#x20;       print("Rule-based status      :", state\["rule\_based\_status"])

&#x20;       print("Cluster status         :", state\["cluster\_detection\_status"])

&#x20;       print("Not measurable suggest :", state\["gap\_not\_measurable\_recommended"])

&#x20;       print("Not measurable reason  :", state\["gap\_not\_measurable\_reason"])

&#x20;       print("Calibration source     :", state\["calibration\_source"])

&#x20;       print("Calibration preset     :", state\["calibration\_preset\_loaded"])

&#x20;       print("-" \* 100)

&#x20;       print("PD source confirmed    :", pd\_source\_dropdown.value)

&#x20;       print("Left line pixel        :", left\_x)

&#x20;       print("Right line pixel       :", right\_x)

&#x20;       print("Left phase             :", f"{result\['left\_phase']:.2f} degree")

&#x20;       print("Right phase            :", f"{result\['right\_phase']:.2f} degree")

&#x20;       print("Gap angle              :", f"{result\['gap\_angle']:.2f} degree")

&#x20;       print("Gap time               :", f"{result\['gap\_time\_ms']:.2f} ms")

&#x20;       print("Gap band               :", result\["gap\_band"])

&#x20;       print("Severity               :", result\["severity"])

&#x20;       print("-" \* 100)

&#x20;       print("Manual adjustment      :", result\["manual\_adjustment\_detected"])

&#x20;       print("Left adjust pixel      :", result\["left\_line\_adjustment\_pixel"])

&#x20;       print("Right adjust pixel     :", result\["right\_line\_adjustment\_pixel"])

&#x20;       print("Gap-time valid         :", gap\_valid)

&#x20;       print("Validation message     :", gap\_msg)



\# =========================================================

\# RUN AI WORKFLOW

\# Flow หลังจากกด Confirm Input and Run AI

\# =========================================================



def run\_final\_workflow(b=None):

&#x20;   with input\_output:

&#x20;       clear\_output(wait=True)



&#x20;       prpd\_item = get\_fileupload\_item(prpd\_upload)

&#x20;       tf\_item = get\_fileupload\_item(tf\_upload)



&#x20;       if prpd\_item is None:

&#x20;           print("ERROR: Please upload PRPD image first.")

&#x20;           return



&#x20;       try:

&#x20;           prpd\_rgb = bytes\_to\_rgb(prpd\_item\["content"])

&#x20;       except Exception as e:

&#x20;           print("ERROR: Cannot read PRPD image:", e)

&#x20;           return



&#x20;       tf\_rgb = None



&#x20;       if tf\_item is not None:

&#x20;           try:

&#x20;               tf\_rgb = bytes\_to\_rgb(tf\_item\["content"])

&#x20;           except Exception as e:

&#x20;               print("ERROR: Cannot read TF Map image:", e)

&#x20;               return



&#x20;       prpd\_filename = prpd\_item\["name"]

&#x20;       tf\_filename = tf\_item\["name"] if tf\_item is not None else ""



&#x20;       input\_quality = validate\_input(

&#x20;           prpd\_filename=prpd\_filename,

&#x20;           prpd\_rgb=prpd\_rgb,

&#x20;           tf\_filename=tf\_filename,

&#x20;           tf\_rgb=tf\_rgb

&#x20;       )



&#x20;       print("=" \* 100)

&#x20;       print("INPUT QUALITY REPORT")

&#x20;       print("=" \* 100)

&#x20;       print("PRPD file          :", prpd\_filename)

&#x20;       print("TF file            :", tf\_filename if tf\_filename else "Not provided")

&#x20;       print("Status             :", input\_quality\["input\_check\_status"])

&#x20;       print("Warnings           :", input\_quality\["input\_warning\_count"])

&#x20;       print("Plot frame detected:", input\_quality\["plot\_frame\_detected"])

&#x20;       print("Plot area ratio    :", input\_quality\["plot\_area\_ratio"])

&#x20;       print("Plot area status   :", input\_quality\["plot\_area\_status"])

&#x20;       print("Default size match :", input\_quality\["default\_size\_match"])



&#x20;       if len(input\_quality\["errors"]) > 0:

&#x20;           print("\\nERRORS:")

&#x20;           for e in input\_quality\["errors"]:

&#x20;               print("-", e)

&#x20;           print("\\nCannot continue.")

&#x20;           return



&#x20;       if len(input\_quality\["warnings"]) > 0:

&#x20;           print("\\nWARNINGS:")

&#x20;           for w in input\_quality\["warnings"]:

&#x20;               print("-", w)



&#x20;           if not confirm\_warning\_checkbox.value:

&#x20;               print("\\nPlease tick 'I confirm the input warnings...' before running AI.")

&#x20;               return



&#x20;       abstract\_info = check\_abstract\_case(prpd\_filename, tf\_filename)



&#x20;       print("\\n" + "=" \* 100)

&#x20;       print("CASE IDENTITY")

&#x20;       print("=" \* 100)

&#x20;       print("Is Abstract case :", abstract\_info\["is\_abstract\_case"])

&#x20;       print("Abstract case ID :", abstract\_info\["abstract\_case\_id"])

&#x20;       print("Defect ID        :", abstract\_info\["abstract\_defect\_id"])

&#x20;       print("Defect name      :", abstract\_info\["abstract\_defect\_name"])

&#x20;       print("Match method     :", abstract\_info\["abstract\_match\_method"])



&#x20;       state\["prpd\_filename"] = prpd\_filename

&#x20;       state\["tf\_filename"] = tf\_filename

&#x20;       state\["prpd\_bytes"] = prpd\_item\["content"]

&#x20;       state\["tf\_bytes"] = tf\_item\["content"] if tf\_item is not None else None

&#x20;       state\["prpd\_rgb"] = prpd\_rgb

&#x20;       state\["tf\_rgb"] = tf\_rgb

&#x20;       state\["input\_quality"] = input\_quality

&#x20;       state\["abstract\_info"] = abstract\_info



&#x20;       setup\_sliders\_after\_input()



&#x20;       print("\\n" + "=" \* 100)

&#x20;       print("RUNNING AI CLASSIFICATION")

&#x20;       print("=" \* 100)



&#x20;       if tf\_rgb is not None:

&#x20;           if hybrid\_model is None:

&#x20;               print("WARNING: Hybrid model not available. Falling back to PRPD-only model.")

&#x20;               ai\_result = run\_prpd\_only\_ai(prpd\_rgb)

&#x20;           else:

&#x20;               ai\_result = run\_hybrid\_ai(prpd\_rgb, tf\_rgb)

&#x20;       else:

&#x20;           if prpd\_only\_model is None:

&#x20;               print("ERROR: PRPD-only model is not available.")

&#x20;               return

&#x20;           ai\_result = run\_prpd\_only\_ai(prpd\_rgb)



&#x20;       state\["ai\_result"] = ai\_result



&#x20;       print("Input mode         :", ai\_result\["input\_mode"])

&#x20;       print("Model used         :", ai\_result\["model\_used"])

&#x20;       print("AI display         :", make\_ai\_display\_text(ai\_result))

&#x20;       print("AI final result    :", ai\_result\["final\_result"])

&#x20;       print("AI confidence      :", f"{ai\_result\['final\_score']:.2f}%")

&#x20;       print("AI status          :", ai\_result\["status"])

&#x20;       print("Decision rule      :", ai\_result.get("ai\_decision\_rule", ""))

&#x20;       print("Threshold          :", ai\_result.get("ai\_threshold\_percent", TOPCLASS\_THRESHOLD))

&#x20;       print("Top class          :", ai\_result\["top\_class"], f"{ai\_result\['top\_score']:.2f}%")

&#x20;       print("PD rule class      :", ai\_result\["pd\_rule\_class"])

&#x20;       print("PD selection rule  :", ai\_result\["pd\_selection\_rule"])

&#x20;       print("Suggested PD source:", ai\_result\["suggested\_pd\_source"])



&#x20;       print("\\nAI CLASS CONFIDENCE")

&#x20;       print("-" \* 80)

&#x20;       for c in CLASS\_NAMES:

&#x20;           pct = ai\_result\["confidence\_dict"].get(c, 0.0)

&#x20;           print(f"{c:<10}: {pct:>6.2f}% {make\_percent\_bar(pct)}")



&#x20;       pd\_source\_dropdown.value = ai\_result\["suggested\_pd\_source"]



&#x20;       initialize\_gap\_lines()



&#x20;       update\_ai\_locked\_panel()

&#x20;       update\_status\_html()

&#x20;       draw\_all()



&#x20;       print("\\nREADY: Check/adjust Gap-time lines before clicking Accept and Save.")





run\_button.on\_click(run\_final\_workflow)



\# =========================================================

\# BUTTON EVENTS

\# ผูกปุ่ม slider/manual adjustment/save calibration

\# =========================================================



def move\_value(slider, delta, mark\_manual=True):

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   slider.value = max(slider.min, min(slider.max, slider.value + delta))



&#x20;   if mark\_manual:

&#x20;       if slider in \[x\_left\_slider, x\_right\_slider, y\_top\_slider, y\_bottom\_slider]:

&#x20;           state\["calibration\_source"] = "manual\_axis\_adjusted"

&#x20;           calibration\_mode\_dropdown.value = "Manual calibration"

&#x20;       elif slider in \[left\_line\_slider, right\_line\_slider]:

&#x20;           if state\["initial\_line\_source"] == "ai\_auto":

&#x20;               state\["initial\_line\_source"] = "ai\_auto\_adjusted"

&#x20;           elif state\["initial\_line\_source"] == "rule\_based\_auto":

&#x20;               state\["initial\_line\_source"] = "rule\_based\_auto\_adjusted"

&#x20;           else:

&#x20;               state\["initial\_line\_source"] = "manual"



&#x20;   draw\_all()





btn\_x\_left\_minus.on\_click(lambda b: move\_value(x\_left\_slider, -1))

btn\_x\_left\_plus.on\_click(lambda b: move\_value(x\_left\_slider, +1))

btn\_x\_right\_minus.on\_click(lambda b: move\_value(x\_right\_slider, -1))

btn\_x\_right\_plus.on\_click(lambda b: move\_value(x\_right\_slider, +1))



btn\_y\_top\_minus.on\_click(lambda b: move\_value(y\_top\_slider, -1))

btn\_y\_top\_plus.on\_click(lambda b: move\_value(y\_top\_slider, +1))

btn\_y\_bottom\_minus.on\_click(lambda b: move\_value(y\_bottom\_slider, -1))

btn\_y\_bottom\_plus.on\_click(lambda b: move\_value(y\_bottom\_slider, +1))



btn\_left\_minus.on\_click(lambda b: move\_value(left\_line\_slider, -1))

btn\_left\_plus.on\_click(lambda b: move\_value(left\_line\_slider, +1))

btn\_right\_minus.on\_click(lambda b: move\_value(right\_line\_slider, -1))

btn\_right\_plus.on\_click(lambda b: move\_value(right\_line\_slider, +1))



btn\_redetect.on\_click(lambda b: use\_rule\_based\_gap\_suggestion())

btn\_auto\_gap.on\_click(lambda b: use\_ai\_auto\_gap\_suggestion())



def on\_any\_slider\_change(change=None):

&#x20;   if state\["prpd\_rgb"] is not None:

&#x20;       draw\_all()



for s in \[

&#x20;   x\_left\_slider,

&#x20;   x\_right\_slider,

&#x20;   y\_top\_slider,

&#x20;   y\_bottom\_slider,

&#x20;   left\_line\_slider,

&#x20;   right\_line\_slider

]:

&#x20;   s.observe(on\_any\_slider\_change, names="value")



pd\_source\_dropdown.observe(lambda change: draw\_all(), names="value")



def on\_save\_calib(b=None):

&#x20;   with calibration\_output:

&#x20;       clear\_output(wait=True)

&#x20;       row, status = save\_calibration\_preset\_to\_csv()

&#x20;       if row is None:

&#x20;           print("ERROR:", status)

&#x20;       else:

&#x20;           print("=" \* 80)

&#x20;           print("CALIBRATION PRESET SAVED")

&#x20;           print("=" \* 80)

&#x20;           print(row)

&#x20;           print("CSV:", CALIBRATION\_PRESET\_CSV)



save\_calib\_button.on\_click(on\_save\_calib)



def on\_load\_calib(b=None):

&#x20;   with calibration\_output:

&#x20;       clear\_output(wait=True)

&#x20;       if state\["prpd\_rgb"] is None:

&#x20;           print("ERROR: No image loaded.")

&#x20;           return



&#x20;       preset = find\_matching\_calibration\_preset(

&#x20;           image\_width=state\["image\_width"],

&#x20;           image\_height=state\["image\_height"],

&#x20;           preset\_name=make\_default\_preset\_name()

&#x20;       )



&#x20;       if preset is None:

&#x20;           print("No matching calibration preset found.")

&#x20;           return



&#x20;       apply\_calibration\_preset(preset)

&#x20;       print("=" \* 80)

&#x20;       print("CALIBRATION PRESET LOADED")

&#x20;       print("=" \* 80)

&#x20;       print(preset)

&#x20;       draw\_all()



load\_calib\_button.on\_click(on\_load\_calib)



def on\_clear\_calib(b=None):

&#x20;   with calibration\_output:

&#x20;       clear\_output(wait=True)

&#x20;       if state\["prpd\_rgb"] is None:

&#x20;           print("ERROR: No image loaded.")

&#x20;           return



&#x20;       if not os.path.exists(CALIBRATION\_PRESET\_CSV):

&#x20;           print("No preset CSV found.")

&#x20;           return



&#x20;       df = pd.read\_csv(CALIBRATION\_PRESET\_CSV)

&#x20;       before = len(df)



&#x20;       preset\_name = make\_default\_preset\_name()



&#x20;       df = df\[

&#x20;           \~(

&#x20;               (df\["preset\_name"].astype(str) == str(preset\_name)) \&

&#x20;               (df\["image\_width"].astype(int) == int(state\["image\_width"])) \&

&#x20;               (df\["image\_height"].astype(int) == int(state\["image\_height"]))

&#x20;           )

&#x20;       ].copy()



&#x20;       df.to\_csv(CALIBRATION\_PRESET\_CSV, index=False)

&#x20;       after = len(df)



&#x20;       print("Calibration preset cleared.")

&#x20;       print("Removed rows:", before - after)



clear\_calib\_button.on\_click(on\_clear\_calib)



\# =========================================================

\# SAVE RESULT

\# Save แบบ smart save: Abstract overwrite + edit history / External timestamp folder

\# =========================================================



def build\_result\_row(not\_measurable=False):

&#x20;   result = compute\_current\_result()

&#x20;   gap\_valid, gap\_message = validate\_gap\_time\_result(result)



&#x20;   ai = state\["ai\_result"]

&#x20;   iq = state\["input\_quality"]

&#x20;   abs\_info = state\["abstract\_info"]



&#x20;   created\_time = now\_str()

&#x20;   updated\_time = created\_time



&#x20;   if abs\_info\["is\_abstract\_case"]:

&#x20;       save\_mode = "overwrite\_abstract\_case"

&#x20;   else:

&#x20;       save\_mode = "save\_external\_timestamped\_case"



&#x20;   if not\_measurable:

&#x20;       gap\_valid = True

&#x20;       gap\_message = "Not measurable selected by user."



&#x20;   row = {

&#x20;       "record\_id": abs\_info\["abstract\_case\_id"] if abs\_info\["is\_abstract\_case"] else safe\_name(state\["prpd\_filename"]),

&#x20;       "case\_base\_name": abs\_info\["abstract\_case\_id"] if abs\_info\["is\_abstract\_case"] else safe\_name(state\["prpd\_filename"]),

&#x20;       "prpd\_filename": state\["prpd\_filename"],

&#x20;       "tf\_filename": state\["tf\_filename"],



&#x20;       "is\_abstract\_case": abs\_info\["is\_abstract\_case"],

&#x20;       "abstract\_case\_id": abs\_info\["abstract\_case\_id"],

&#x20;       "abstract\_defect\_id": abs\_info\["abstract\_defect\_id"],

&#x20;       "abstract\_defect\_name": abs\_info\["abstract\_defect\_name"],

&#x20;       "abstract\_match\_method": abs\_info\["abstract\_match\_method"],

&#x20;       "save\_mode": save\_mode,

&#x20;       "previous\_result\_replaced": False,



&#x20;       "input\_check\_status": iq\["input\_check\_status"],

&#x20;       "input\_has\_warning": iq\["input\_has\_warning"],

&#x20;       "input\_warning\_count": iq\["input\_warning\_count"],

&#x20;       "input\_warnings": iq\["input\_warnings"],

&#x20;       "user\_confirmed\_input\_warning": confirm\_warning\_checkbox.value,

&#x20;       "prpd\_filename\_check": iq\["prpd\_filename\_check"],

&#x20;       "tf\_filename\_check": iq\["tf\_filename\_check"],

&#x20;       "pair\_filename\_match": iq\["pair\_filename\_match"],

&#x20;       "plot\_frame\_detected": iq\["plot\_frame\_detected"],

&#x20;       "plot\_area\_ratio": iq\["plot\_area\_ratio"],

&#x20;       "plot\_area\_status": iq\["plot\_area\_status"],



&#x20;       "ai\_input\_mode": ai\["input\_mode"],

&#x20;       "ai\_model\_used": ai\["model\_used"],

&#x20;       "ai\_model\_path": ai\["model\_path\_used"],

&#x20;       "ai\_top\_class": ai\["top\_class"],

&#x20;       "ai\_top\_score\_percent": round(ai\["top\_score"], 6),

&#x20;       "ai\_final\_result": ai\["final\_result"],

&#x20;       "ai\_final\_score\_percent": round(ai\["final\_score"], 6),

&#x20;       "ai\_status": ai\["status"],

&#x20;       "ai\_high\_conf\_count": ai\["high\_conf\_count"],

&#x20;       "ai\_non\_identified\_percent": round(ai\["non\_identified\_percent"], 6),

&#x20;       "ai\_decision\_rule": ai.get("ai\_decision\_rule", "top\_class\_gt\_30\_else\_non\_identified"),

&#x20;       "ai\_threshold\_percent": ai.get("ai\_threshold\_percent", TOPCLASS\_THRESHOLD),

&#x20;       "ai\_confidence\_corona": round(ai\["confidence\_dict"].get("Corona", np.nan), 6),

&#x20;       "ai\_confidence\_surface": round(ai\["confidence\_dict"].get("Surface", np.nan), 6),

&#x20;       "ai\_confidence\_internal": round(ai\["confidence\_dict"].get("Internal", np.nan), 6),



&#x20;       "pd\_rule\_class": ai\["pd\_rule\_class"],

&#x20;       "pd\_selection\_rule": ai\["pd\_selection\_rule"],

&#x20;       "is\_strong\_pd\_rule": ai\["is\_strong\_pd\_rule"],

&#x20;       "suggested\_pd\_source\_type": ai\["suggested\_pd\_source"],

&#x20;       "confirmed\_pd\_source\_type": pd\_source\_dropdown.value,



&#x20;       "image\_width": state\["image\_width"],

&#x20;       "image\_height": state\["image\_height"],

&#x20;       "default\_size\_match": state\["default\_size\_match"],

&#x20;       "calibration\_mode": calibration\_mode\_dropdown.value,

&#x20;       "calibration\_source": state\["calibration\_source"],

&#x20;       "calibration\_preset\_loaded": state\["calibration\_preset\_loaded"],

&#x20;       "calibration\_preset\_path": state\["calibration\_preset\_path"],

&#x20;       "auto\_calibration\_status": state\["auto\_calibration\_status"],



&#x20;       "x\_left\_0deg": x\_left\_slider.value,

&#x20;       "x\_right\_360deg": x\_right\_slider.value,

&#x20;       "y\_top\_plot": y\_top\_slider.value,

&#x20;       "y\_bottom\_plot": y\_bottom\_slider.value,



&#x20;       "auto\_gap\_model\_available": state\["auto\_gap\_model\_available"],

&#x20;       "auto\_gap\_model\_path": state\["auto\_gap\_model\_path"],

&#x20;       "auto\_gap\_model\_version": state\["auto\_gap\_model\_version"],

&#x20;       "auto\_gap\_status": state\["auto\_gap\_status"],

&#x20;       "auto\_left\_line\_pixel": state\["auto\_left\_line\_pixel"],

&#x20;       "auto\_right\_line\_pixel": state\["auto\_right\_line\_pixel"],

&#x20;       "auto\_left\_phase\_deg": state\["auto\_left\_phase\_deg"],

&#x20;       "auto\_right\_phase\_deg": state\["auto\_right\_phase\_deg"],

&#x20;       "auto\_gap\_time\_ms": state\["auto\_gap\_time\_ms"],



&#x20;       "rule\_based\_status": state\["rule\_based\_status"],

&#x20;       "cluster\_detection\_status": state\["cluster\_detection\_status"],

&#x20;       "gap\_not\_measurable\_recommended": state\["gap\_not\_measurable\_recommended"],

&#x20;       "gap\_not\_measurable\_reason": state\["gap\_not\_measurable\_reason"],



&#x20;       "review\_status": review\_status\_dropdown.value,

&#x20;       "reviewer\_name": reviewer\_name\_text.value.strip() if reviewer\_name\_text.value.strip() != "" else "unknown\_reviewer",

&#x20;       "reviewer\_role": reviewer\_role\_dropdown.value,

&#x20;       "review\_note": review\_note\_text.value,

&#x20;       "not\_measurable\_reason": (

&#x20;           not\_measurable\_reason\_dropdown.value

&#x20;           if not\_measurable\_reason\_dropdown.value != ""

&#x20;           else state.get("gap\_not\_measurable\_reason", "")

&#x20;       ) if not\_measurable else "",



&#x20;       "final\_code\_version": FINAL\_CODE\_VERSION,

&#x20;       "created\_time": created\_time,

&#x20;       "updated\_time": updated\_time

&#x20;   }



&#x20;   if not\_measurable:

&#x20;       row.update({

&#x20;           "final\_left\_line\_pixel": np.nan,

&#x20;           "final\_right\_line\_pixel": np.nan,

&#x20;           "left\_phase\_deg": np.nan,

&#x20;           "right\_phase\_deg": np.nan,

&#x20;           "gap\_angle\_deg": np.nan,

&#x20;           "gap\_time\_ms": np.nan,

&#x20;           "gap\_time\_band": "Not measurable",

&#x20;           "severity\_by\_gap\_time": "Not measurable",

&#x20;           "gap\_line\_source": "not\_measurable",

&#x20;           "manual\_adjustment\_detected": False,

&#x20;           "left\_line\_adjustment\_pixel": np.nan,

&#x20;           "right\_line\_adjustment\_pixel": np.nan,

&#x20;           "gap\_time\_valid": True,

&#x20;           "gap\_time\_validation\_message": "Not measurable selected.",

&#x20;           "gap\_measurement\_status": "not\_measurable"

&#x20;       })

&#x20;   else:

&#x20;       row.update({

&#x20;           "final\_left\_line\_pixel": result\["left\_x"],

&#x20;           "final\_right\_line\_pixel": result\["right\_x"],

&#x20;           "left\_phase\_deg": round(result\["left\_phase"], 6),

&#x20;           "right\_phase\_deg": round(result\["right\_phase"], 6),

&#x20;           "gap\_angle\_deg": round(result\["gap\_angle"], 6),

&#x20;           "gap\_time\_ms": round(result\["gap\_time\_ms"], 6) if not np.isnan(result\["gap\_time\_ms"]) else np.nan,

&#x20;           "gap\_time\_band": result\["gap\_band"],

&#x20;           "severity\_by\_gap\_time": result\["severity"],

&#x20;           "gap\_line\_source": state\["initial\_line\_source"] if state\["initial\_line\_source"] else "manual",

&#x20;           "manual\_adjustment\_detected": result\["manual\_adjustment\_detected"],

&#x20;           "left\_line\_adjustment\_pixel": result\["left\_line\_adjustment\_pixel"],

&#x20;           "right\_line\_adjustment\_pixel": result\["right\_line\_adjustment\_pixel"],

&#x20;           "gap\_time\_valid": gap\_valid,

&#x20;           "gap\_time\_validation\_message": gap\_message,

&#x20;           "gap\_measurement\_status": "accepted" if gap\_valid else "invalid"

&#x20;       })



&#x20;   return row





def save\_annotated\_image(output\_path, row, not\_measurable=False):

&#x20;   img\_rgb = state\["prpd\_rgb"]



&#x20;   x\_left = row\["x\_left\_0deg"]

&#x20;   x\_right = row\["x\_right\_360deg"]

&#x20;   y\_top = row\["y\_top\_plot"]

&#x20;   y\_bottom = row\["y\_bottom\_plot"]



&#x20;   fig, ax = plt.subplots(figsize=(11, 6))

&#x20;   ax.imshow(img\_rgb)



&#x20;   rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;   rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;   ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Plot frame")



&#x20;   ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.8, label="0° / 360°")

&#x20;   ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.8)



&#x20;   for phase in \[90, 180, 270]:

&#x20;       ax.axvline(

&#x20;           phase\_deg\_to\_pixel(phase, x\_left, x\_right),

&#x20;           color="gray",

&#x20;           linestyle=":",

&#x20;           linewidth=1.2

&#x20;       )



&#x20;   if row\["ai\_final\_result"] == "Non-identified":

&#x20;       ai\_title\_text = "AI result: Non-identified"

&#x20;   else:

&#x20;       ai\_title\_text = f"AI top class: {row\['ai\_final\_result']} ({row\['ai\_final\_score\_percent']:.2f}%)"



&#x20;   if not not\_measurable:

&#x20;       if not np.isnan(row.get("auto\_left\_line\_pixel", np.nan)):

&#x20;           ax.axvline(row\["auto\_left\_line\_pixel"], color="red", linestyle=":", linewidth=1.3, label="AI suggested left")

&#x20;           ax.axvline(row\["auto\_right\_line\_pixel"], color="green", linestyle=":", linewidth=1.3, label="AI suggested right")



&#x20;       ax.axvline(row\["final\_left\_line\_pixel"], color="red", linewidth=2.8, label="Final left")

&#x20;       ax.axvline(row\["final\_right\_line\_pixel"], color="green", linewidth=2.8, label="Final right")



&#x20;       title = (

&#x20;           f"{state\['prpd\_filename']}\\n"

&#x20;           f"{ai\_title\_text} | "

&#x20;           f"PD source: {row\['confirmed\_pd\_source\_type']}\\n"

&#x20;           f"Gap angle = {row\['gap\_angle\_deg']:.2f}° | "

&#x20;           f"Gap time = {row\['gap\_time\_ms']:.2f} ms | "

&#x20;           f"Band = {row\['gap\_time\_band']} | Severity = {row\['severity\_by\_gap\_time']}"

&#x20;       )

&#x20;   else:

&#x20;       title = (

&#x20;           f"{state\['prpd\_filename']}\\n"

&#x20;           f"{ai\_title\_text} | "

&#x20;           f"PD source: {row\['confirmed\_pd\_source\_type']}\\n"

&#x20;           f"Gap-time: Not measurable"

&#x20;       )



&#x20;   ax.set\_title(title, fontsize=10)

&#x20;   ax.axis("off")

&#x20;   ax.legend(loc="upper right", fontsize=8)



&#x20;   os.makedirs(os.path.dirname(output\_path), exist\_ok=True)

&#x20;   plt.savefig(output\_path, dpi=300, bbox\_inches="tight")

&#x20;   plt.close(fig)





def update\_summary\_csv(summary\_csv, row, key\_col="case\_base\_name", replace\_existing=True):

&#x20;   df\_new = pd.DataFrame(\[row])

&#x20;   previous\_replaced = False



&#x20;   if os.path.exists(summary\_csv):

&#x20;       df\_old = pd.read\_csv(summary\_csv)



&#x20;       if replace\_existing and key\_col in df\_old.columns:

&#x20;           before = len(df\_old)

&#x20;           df\_old = df\_old\[df\_old\[key\_col].astype(str) != str(row\[key\_col])].copy()

&#x20;           after = len(df\_old)

&#x20;           previous\_replaced = before != after



&#x20;       df\_all = pd.concat(\[df\_old, df\_new], ignore\_index=True)

&#x20;   else:

&#x20;       df\_all = df\_new



&#x20;   df\_all.to\_csv(summary\_csv, index=False)

&#x20;   return previous\_replaced





def save\_result(not\_measurable=False):

&#x20;   if state\["prpd\_rgb"] is None or state\["ai\_result"] is None:

&#x20;       with plot\_output:

&#x20;           print("ERROR: No result to save.")

&#x20;       return



&#x20;   row = build\_result\_row(not\_measurable=not\_measurable)



&#x20;   if not not\_measurable and not row\["gap\_time\_valid"]:

&#x20;       with plot\_output:

&#x20;           print("\\n" + "!" \* 100)

&#x20;           print("CANNOT SAVE: Invalid gap-time result")

&#x20;           print(row\["gap\_time\_validation\_message"])

&#x20;           print("Please adjust lines or choose Not Measurable.")

&#x20;           print("!" \* 100)

&#x20;       return



&#x20;   is\_abstract = row\["is\_abstract\_case"]



&#x20;   if is\_abstract:

&#x20;       by\_image\_dir = ABSTRACT\_BY\_IMAGE\_DIR

&#x20;       summary\_csv = ABSTRACT\_SUMMARY\_CSV

&#x20;       edit\_history\_csv = ABSTRACT\_EDIT\_HISTORY\_CSV



&#x20;       folder\_name = safe\_name(row\["case\_base\_name"])

&#x20;       result\_folder = os.path.join(by\_image\_dir, folder\_name)



&#x20;   else:

&#x20;       by\_image\_dir = EXTERNAL\_BY\_IMAGE\_DIR

&#x20;       summary\_csv = EXTERNAL\_SUMMARY\_CSV

&#x20;       edit\_history\_csv = ""



&#x20;       folder\_name = safe\_name(state\["prpd\_filename"]) + "\_" + timestamp\_str()

&#x20;       result\_folder = os.path.join(by\_image\_dir, folder\_name)



&#x20;   os.makedirs(result\_folder, exist\_ok=True)



&#x20;   prpd\_ext = os.path.splitext(state\["prpd\_filename"])\[1].lower()

&#x20;   if prpd\_ext == "":

&#x20;       prpd\_ext = ".jpg"



&#x20;   tf\_ext = os.path.splitext(state\["tf\_filename"])\[1].lower()

&#x20;   if tf\_ext == "":

&#x20;       tf\_ext = ".jpg"



&#x20;   prpd\_original\_path = os.path.join(result\_folder, f"{safe\_name(state\['prpd\_filename'])}\_original\_PRPD{prpd\_ext}")

&#x20;   save\_bytes(prpd\_original\_path, state\["prpd\_bytes"])



&#x20;   if state\["tf\_bytes"] is not None:

&#x20;       tf\_original\_path = os.path.join(result\_folder, f"{safe\_name(state\['tf\_filename'])}\_original\_TF{tf\_ext}")

&#x20;       save\_bytes(tf\_original\_path, state\["tf\_bytes"])

&#x20;   else:

&#x20;       tf\_original\_path = ""



&#x20;   annotated\_path = os.path.join(result\_folder, f"{safe\_name(state\['prpd\_filename'])}\_annotated\_gap\_time.png")

&#x20;   per\_image\_csv\_path = os.path.join(result\_folder, f"{safe\_name(state\['prpd\_filename'])}\_final\_result.csv")



&#x20;   row\["result\_folder"] = result\_folder

&#x20;   row\["original\_prpd\_path"] = prpd\_original\_path

&#x20;   row\["original\_tf\_path"] = tf\_original\_path

&#x20;   row\["annotated\_image\_path"] = annotated\_path

&#x20;   row\["per\_image\_csv\_path"] = per\_image\_csv\_path

&#x20;   row\["summary\_csv\_path"] = summary\_csv

&#x20;   row\["edit\_history\_csv\_path"] = edit\_history\_csv



&#x20;   save\_annotated\_image(annotated\_path, row, not\_measurable=not\_measurable)

&#x20;   pd.DataFrame(\[row]).to\_csv(per\_image\_csv\_path, index=False)



&#x20;   if is\_abstract:

&#x20;       previous\_replaced = update\_summary\_csv(

&#x20;           ABSTRACT\_SUMMARY\_CSV,

&#x20;           row,

&#x20;           key\_col="case\_base\_name",

&#x20;           replace\_existing=True

&#x20;       )

&#x20;       row\["previous\_result\_replaced"] = previous\_replaced



&#x20;       pd.DataFrame(\[row]).to\_csv(per\_image\_csv\_path, index=False)



&#x20;       update\_summary\_csv(

&#x20;           ABSTRACT\_SUMMARY\_CSV,

&#x20;           row,

&#x20;           key\_col="case\_base\_name",

&#x20;           replace\_existing=True

&#x20;       )



&#x20;       df\_hist\_new = pd.DataFrame(\[row])

&#x20;       if os.path.exists(ABSTRACT\_EDIT\_HISTORY\_CSV):

&#x20;           df\_hist\_old = pd.read\_csv(ABSTRACT\_EDIT\_HISTORY\_CSV)

&#x20;           df\_hist\_all = pd.concat(\[df\_hist\_old, df\_hist\_new], ignore\_index=True)

&#x20;       else:

&#x20;           df\_hist\_all = df\_hist\_new



&#x20;       df\_hist\_all.to\_csv(ABSTRACT\_EDIT\_HISTORY\_CSV, index=False)



&#x20;   else:

&#x20;       df\_new = pd.DataFrame(\[row])

&#x20;       if os.path.exists(EXTERNAL\_SUMMARY\_CSV):

&#x20;           df\_old = pd.read\_csv(EXTERNAL\_SUMMARY\_CSV)

&#x20;           df\_all = pd.concat(\[df\_old, df\_new], ignore\_index=True)

&#x20;       else:

&#x20;           df\_all = df\_new



&#x20;       df\_all.to\_csv(EXTERNAL\_SUMMARY\_CSV, index=False)



&#x20;   # Save Excel review file with embedded annotated image

&#x20;   append\_result\_to\_excel(row, MASTER\_EXCEL\_PATH)

&#x20;   reviewer\_excel\_path = append\_result\_to\_reviewer\_excel(row)



&#x20;   with plot\_output:

&#x20;       print("\\n" + "=" \* 100)

&#x20;       print("SAVED SUCCESSFULLY")

&#x20;       print("=" \* 100)

&#x20;       print("Case type       :", "Abstract" if is\_abstract else "External")

&#x20;       print("Save mode       :", row\["save\_mode"])

&#x20;       print("AI display      :", make\_ai\_display\_text(state\["ai\_result"]))

&#x20;       print("PD source       :", row\["confirmed\_pd\_source\_type"])

&#x20;       print("Gap time        :", row\["gap\_time\_ms"])

&#x20;       print("Severity        :", row\["severity\_by\_gap\_time"])

&#x20;       print("Result folder   :", result\_folder)

&#x20;       print("Annotated image :", annotated\_path)

&#x20;       print("Per-image CSV   :", per\_image\_csv\_path)

&#x20;       print("Summary CSV     :", summary\_csv)

&#x20;       print("Master Excel    :", MASTER\_EXCEL\_PATH)

&#x20;       print("Reviewer Excel  :", reviewer\_excel\_path)

&#x20;       if is\_abstract:

&#x20;           print("Edit history    :", ABSTRACT\_EDIT\_HISTORY\_CSV)





def on\_accept\_clicked(b=None):

&#x20;   review\_status\_dropdown.value = review\_status\_dropdown.value if review\_status\_dropdown.value != "not\_measurable" else "user\_confirmed"

&#x20;   save\_result(not\_measurable=False)



btn\_accept.on\_click(on\_accept\_clicked)





def on\_not\_measurable\_clicked(b=None):

&#x20;   review\_status\_dropdown.value = "not\_measurable"

&#x20;   save\_result(not\_measurable=True)



btn\_not\_measurable.on\_click(on\_not\_measurable\_clicked)



\# =========================================================

\# DISPLAY UI

\# แสดง UI ทั้งหมดใน Colab

\# =========================================================



gap\_guideline\_html = widgets.HTML("""

<div style="

&#x20;   border: 2px solid #60a5fa;

&#x20;   background: #111827;

&#x20;   color: #f9fafb;

&#x20;   padding: 14px;

&#x20;   border-radius: 10px;

&#x20;   line-height: 1.65;

&#x20;   margin: 10px 0;

&#x20;   font-size: 15px;

">

<b style="color:#93c5fd;">Gap-time Measurement Guideline</b><br><br>



The suggested gap-time lines are provided as <b>initial references only</b>. They are not the final measurement result.<br><br>



The user should place the <b style="color:#f87171;">left line</b> at the

<b>trailing edge of the preceding discharge cluster</b>, and place the

<b style="color:#4ade80;">right line</b> at the

<b>leading edge of the following discharge cluster</b> on the PRPD pattern.<br><br>



The final gap-time value will be calculated only from the <b>user-confirmed or expert-adjusted line positions</b>.<br><br>



<b style="color:#fbbf24;">Note:</b> The Auto Gap-time model is used only to reduce manual adjustment effort by suggesting starting line positions. The user should always check and adjust the lines before saving.

</div>

""")



ui = widgets.VBox(\[

&#x20;   widgets.HTML("<h1>CMD FINAL SYSTEM: AI Classification + Auto-suggested Gap-time + Smart Save</h1>"),

&#x20;   notice\_html,



&#x20;   widgets.HTML("<hr><h2>1) Upload Input</h2>"),

&#x20;   widgets.HBox(\[prpd\_upload, tf\_upload]),

&#x20;   confirm\_warning\_checkbox,

&#x20;   run\_button,

&#x20;   input\_output,



&#x20;   widgets.HTML("<hr><h2>2) LOCKED AI RESULT PANEL</h2>"),

&#x20;   ai\_locked\_panel,



&#x20;   widgets.HTML("<hr><h2>3) Gap-time Measurement</h2>"),

&#x20;   gap\_guideline\_html,

&#x20;   status\_html,



&#x20;   widgets.HTML("<h3>3.1 Axis / Plot Frame Calibration</h3>"),

&#x20;   calibration\_mode\_dropdown,

&#x20;   widgets.HBox(\[

&#x20;       widgets.VBox(\[x\_left\_slider, widgets.HBox(\[btn\_x\_left\_minus, btn\_x\_left\_plus])]),

&#x20;       widgets.VBox(\[x\_right\_slider, widgets.HBox(\[btn\_x\_right\_minus, btn\_x\_right\_plus])])

&#x20;   ]),

&#x20;   widgets.HBox(\[

&#x20;       widgets.VBox(\[y\_top\_slider, widgets.HBox(\[btn\_y\_top\_minus, btn\_y\_top\_plus])]),

&#x20;       widgets.VBox(\[y\_bottom\_slider, widgets.HBox(\[btn\_y\_bottom\_minus, btn\_y\_bottom\_plus])])

&#x20;   ]),

&#x20;   widgets.HBox(\[save\_calib\_button, load\_calib\_button, clear\_calib\_button]),

&#x20;   calibration\_output,



&#x20;   widgets.HTML("<h3>3.2 Gap-time Suggestion</h3>"),

&#x20;   widgets.HBox(\[btn\_auto\_gap, btn\_redetect]),



&#x20;   widgets.HTML("<h3>3.3 Confirm PD Source</h3>"),

&#x20;   pd\_source\_dropdown,



&#x20;   widgets.HTML("<hr><h2>4) Current Plot / Result</h2>"),

&#x20;   plot\_output,



&#x20;   widgets.HTML("<h3>3.4 Adjust Final Gap-time Lines</h3>"),

&#x20;   widgets.HBox(\[

&#x20;       widgets.VBox(\[left\_line\_slider, widgets.HBox(\[btn\_left\_minus, btn\_left\_plus])]),

&#x20;       widgets.VBox(\[right\_line\_slider, widgets.HBox(\[btn\_right\_minus, btn\_right\_plus])])

&#x20;   ]),



&#x20;   widgets.HTML("<h3>3.5 Review / Expert Confirmation</h3>"),

&#x20;   reviewer\_name\_text,

&#x20;   widgets.HBox(\[review\_status\_dropdown, reviewer\_role\_dropdown]),

&#x20;   review\_note\_text,

&#x20;   not\_measurable\_reason\_dropdown,



&#x20;   widgets.HTML("<h3>3.6 Save Result</h3>"),

&#x20;   widgets.HBox(\[btn\_accept, btn\_not\_measurable]),

])



display(ui)



print("=" \* 100)

print("CMD FINAL CODE LOADED - TOPCLASS RULE V2")

print("=" \* 100)

print("Model 2 path          :", PRPD\_ONLY\_MODEL\_PATH)

print("Model 3 path          :", HYBRID\_MODEL\_PATH)

print("Auto Gap v1 path      :", AUTO\_GAP\_MODEL\_PATH)

print("New result root       :", NEW\_RESULT\_ROOT)

print("Abstract summary CSV  :", ABSTRACT\_SUMMARY\_CSV)

print("External summary CSV  :", EXTERNAL\_SUMMARY\_CSV)

print("Master Excel          :", MASTER\_EXCEL\_PATH)

print("Calibration preset CSV:", CALIBRATION\_PRESET\_CSV)

print("\\nAI rule:")

print(f"- If Corona/Surface/Internal are all <= {TOPCLASS\_THRESHOLD:.0f}% => Non-identified")

print(f"- If any class > {TOPCLASS\_THRESHOLD:.0f}% => use top class and confidence")

print("\\nReady. Upload PRPD image and optional TF Map, then click Confirm Input and Run AI.")



**PART4 AUTO WORKFLOW**

\# =========================================================

\# MODEL 4 AUTO WORKFLOW V5 - TOPCLASS RULE + MANUAL NOT-MEASURABLE DECISION

\# REPLACE OLD AUTO WITH THIS CELL

\# Dataset Auto-loader + Resume + Locked AI Panel

\# + PD Source Top-class Rule 30%

\# + Calibration Preset Memory

\# + Reviewer once + Auto Excel output

\# =========================================================



from google.colab import drive

drive.mount("/content/drive")



import os

import re

import io

import cv2

import numpy as np

import pandas as pd

import matplotlib.pyplot as plt

import tensorflow as tf

import ipywidgets as widgets



from PIL import Image

from IPython.display import display, clear\_output

from datetime import datetime



from openpyxl import Workbook, load\_workbook

from openpyxl.drawing.image import Image as XLImage

from openpyxl.styles import Alignment, Font, PatternFill, Border, Side



\# =========================================================

\# PATH SETTINGS

\# =========================================================



MAPPING\_CSV = "/content/drive/MyDrive/dataset\_main\_4th\_extracted/mapping\_dataset\_main\_4th.csv"

HYBRID\_MODEL\_PATH = "/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras"



\# New result root: separate from old folders

NEW\_RESULT\_ROOT = "/content/drive/MyDrive/CMD\_FINAL\_RESULTS\_TOPCLASS\_RULE\_V2\_20260523"



BASE\_RESULT\_DIR = os.path.join(NEW\_RESULT\_ROOT, "by\_image")

SUMMARY\_CSV = os.path.join(NEW\_RESULT\_ROOT, "final\_summary.csv")

EDIT\_HISTORY\_CSV = os.path.join(NEW\_RESULT\_ROOT, "edit\_history.csv")



EXCEL\_RESULT\_DIR = os.path.join(NEW\_RESULT\_ROOT, "excel")

MASTER\_EXCEL\_PATH = os.path.join(EXCEL\_RESULT\_DIR, "CMD\_model4\_auto\_review\_results\_TOPCLASS\_RULE\_V5.xlsx")



REVIEWER\_ROOT\_DIR = os.path.join(NEW\_RESULT\_ROOT, "by\_reviewer")

REVIEWER\_CONFIG\_CSV = os.path.join(NEW\_RESULT\_ROOT, "auto\_reviewer\_config.csv")



CALIBRATION\_DIR = os.path.join(NEW\_RESULT\_ROOT, "calibration")

CALIBRATION\_PRESET\_CSV = os.path.join(CALIBRATION\_DIR, "calibration\_preset.csv")



for \_d in \[

&#x20;   NEW\_RESULT\_ROOT,

&#x20;   BASE\_RESULT\_DIR,

&#x20;   EXCEL\_RESULT\_DIR,

&#x20;   REVIEWER\_ROOT\_DIR,

&#x20;   CALIBRATION\_DIR

]:

&#x20;   os.makedirs(\_d, exist\_ok=True)



\# =========================================================

\# SETTINGS

\# =========================================================



RESUME\_MODE = True



CLASS\_NAMES = \["Corona", "Surface", "Internal"]



IMG\_SIZE = 224

\# Old threshold is kept only for reference.

\# The final AI display uses TOPCLASS\_THRESHOLD below.

CONFIDENCE\_THRESHOLD = 85.0



\# Advisor rule:

\# If Corona/Surface/Internal are all <= 30% => Non-identified

\# If any class > 30% => use top class and confidence

TOPCLASS\_THRESHOLD = 30.0



DEFAULT\_IMAGE\_WIDTH = 388

DEFAULT\_IMAGE\_HEIGHT = 281



DEFAULT\_X\_LEFT = 73

DEFAULT\_X\_RIGHT = 348

DEFAULT\_Y\_TOP = 16

DEFAULT\_Y\_BOTTOM = 233



CYCLE\_TIME\_MS = 20.0  # 50 Hz -> 360 degree = 20 ms



PD\_SOURCE\_OPTIONS = \[

&#x20;   "Floating / Corona / Bad contact",

&#x20;   "Outside surface discharge",

&#x20;   "Terminations / Joint",

&#x20;   "Internal",

&#x20;   "Manual confirmation required"

]



\# =========================================================

\# LOAD MODEL

\# =========================================================



print("=" \* 100)

print("LOADING HYBRID MODEL")

print("=" \* 100)



hybrid\_model = tf.keras.models.load\_model(HYBRID\_MODEL\_PATH, compile=False)



print("Hybrid model loaded:", HYBRID\_MODEL\_PATH)

print("Hybrid model inputs :", \[inp.name for inp in hybrid\_model.inputs])

print("Hybrid model shapes :", \[inp.shape for inp in hybrid\_model.inputs])

print("Hybrid model outputs:", \[out.shape for out in hybrid\_model.outputs])



\# =========================================================

\# LOAD MAPPING CSV + RESUME MODE

\# =========================================================



df\_map = pd.read\_csv(MAPPING\_CSV)



df\_map\_all\_ok = df\_map\[

&#x20;   (df\_map\["status"] == "ok") \&

&#x20;   (df\_map\["output\_prpd\_path"].notna()) \&

&#x20;   (df\_map\["output\_tf\_path"].notna()) \&

&#x20;   (df\_map\["output\_prpd\_path"] != "") \&

&#x20;   (df\_map\["output\_tf\_path"] != "")

].copy().reset\_index(drop=True)



df\_map\_ok = df\_map\_all\_ok.copy()

completed\_cases = set()



print("\\n" + "=" \* 100)

print("MAPPING DATASET LOADED")

print("=" \* 100)

print("Total mapping records     :", len(df\_map))

print("Available PRPD + TF pairs :", len(df\_map\_all\_ok))



if RESUME\_MODE and os.path.exists(SUMMARY\_CSV):

&#x20;   df\_done = pd.read\_csv(SUMMARY\_CSV)



&#x20;   if "case\_base\_name" in df\_done.columns:

&#x20;       completed\_cases = set(

&#x20;           df\_done\["case\_base\_name"]

&#x20;           .dropna()

&#x20;           .astype(str)

&#x20;           .tolist()

&#x20;       )



&#x20;       before\_count = len(df\_map\_ok)



&#x20;       df\_map\_ok = df\_map\_ok\[

&#x20;           \~df\_map\_ok\["case\_base\_name"].astype(str).isin(completed\_cases)

&#x20;       ].copy().reset\_index(drop=True)



&#x20;       after\_count = len(df\_map\_ok)



&#x20;       print("\\n" + "=" \* 100)

&#x20;       print("RESUME MODE ENABLED")

&#x20;       print("=" \* 100)

&#x20;       print("Summary CSV             :", SUMMARY\_CSV)

&#x20;       print("Completed cases found   :", len(completed\_cases))

&#x20;       print("Skipped completed cases :", before\_count - after\_count)

&#x20;       print("Remaining cases         :", after\_count)



&#x20;       if after\_count > 0:

&#x20;           print("Next case               :", df\_map\_ok.iloc\[0]\["case\_base\_name"])

&#x20;       else:

&#x20;           print("All cases already completed.")

&#x20;   else:

&#x20;       print("\\nSUMMARY\_CSV exists but has no case\_base\_name column. Resume skipped.")

else:

&#x20;   print("\\nRESUME MODE: No previous summary found, or RESUME\_MODE is False.")



\# =========================================================

\# GLOBAL STATE

\# =========================================================



state = {

&#x20;   "current\_map\_row": None,



&#x20;   "prpd\_filename": None,

&#x20;   "tf\_filename": None,



&#x20;   "prpd\_path": None,

&#x20;   "tf\_path": None,



&#x20;   "prpd\_bytes": None,

&#x20;   "tf\_bytes": None,



&#x20;   "prpd\_rgb": None,

&#x20;   "tf\_rgb": None,



&#x20;   "ai\_result": None,



&#x20;   "image\_width": None,

&#x20;   "image\_height": None,

&#x20;   "default\_size\_match": False,



&#x20;   "auto\_x\_left": None,

&#x20;   "auto\_x\_right": None,

&#x20;   "auto\_y\_top": None,

&#x20;   "auto\_y\_bottom": None,

&#x20;   "auto\_calibration\_status": "",



&#x20;   "calibration\_source": "",

&#x20;   "calibration\_preset\_loaded": False,

&#x20;   "calibration\_preset\_path": CALIBRATION\_PRESET\_CSV,



&#x20;   "auto\_result": None,

&#x20;   "auto\_detection\_status": "not\_detected\_yet",



&#x20;   # Auto Not-measurable logic

&#x20;   "gap\_not\_measurable\_recommended": False,

&#x20;   "gap\_not\_measurable\_reason": "",

&#x20;   "gap\_not\_measurable\_status": ""

}



level\_state = {

&#x20;   "current\_df": None,

&#x20;   "current\_position": 0,

&#x20;   "current\_original\_index": None,

&#x20;   "auto\_next\_enabled": True

}



\# =========================================================

\# BASIC HELPERS

\# =========================================================



def read\_image\_bytes(path):

&#x20;   with open(path, "rb") as f:

&#x20;       return f.read()





def bytes\_to\_rgb\_image(image\_bytes):

&#x20;   pil\_img = Image.open(io.BytesIO(image\_bytes)).convert("RGB")

&#x20;   return np.array(pil\_img)





def save\_bytes\_to\_file(image\_bytes, path):

&#x20;   os.makedirs(os.path.dirname(path), exist\_ok=True)

&#x20;   with open(path, "wb") as f:

&#x20;       f.write(image\_bytes)





def safe\_name\_from\_filename(filename):

&#x20;   name = os.path.splitext(os.path.basename(filename))\[0]

&#x20;   name = re.sub(r"\[^\\w\\-]+", "\_", name)

&#x20;   name = re.sub(r"\_+", "\_", name).strip("\_")

&#x20;   return name





def make\_case\_label(row):

&#x20;   return (

&#x20;       f"\[{row\['defect\_id']}] {row\['defect\_name']} | "

&#x20;       f"{row\['case\_base\_name']} | "

&#x20;       f"{row\['output\_prpd\_filename']} + {row\['output\_tf\_filename']}"

&#x20;   )





def get\_filtered\_dataframe():

&#x20;   if defect\_filter\_dropdown.value == "ALL":

&#x20;       df\_use = df\_map\_ok.copy()

&#x20;   else:

&#x20;       df\_use = df\_map\_ok\[df\_map\_ok\["defect\_id"] == defect\_filter\_dropdown.value].copy()



&#x20;   df\_use = df\_use.sort\_values(

&#x20;       by=\["defect\_id", "case\_base\_name"],

&#x20;       ascending=True

&#x20;   ).reset\_index(drop=True)



&#x20;   return df\_use





def get\_original\_index\_from\_row(row):

&#x20;   matched = df\_map\_ok\[

&#x20;       (df\_map\_ok\["output\_prpd\_path"] == row\["output\_prpd\_path"]) \&

&#x20;       (df\_map\_ok\["output\_tf\_path"] == row\["output\_tf\_path"])

&#x20;   ]



&#x20;   if len(matched) == 0:

&#x20;       return None



&#x20;   return int(matched.index\[0])





def get\_current\_image\_size\_for\_preset():

&#x20;   if state.get("prpd\_rgb", None) is None:

&#x20;       return None, None



&#x20;   h, w = state\["prpd\_rgb"].shape\[:2]

&#x20;   return int(w), int(h)





def make\_default\_preset\_name():

&#x20;   return "dataset\_main\_4th\_extracted\_default"



\# =========================================================

\# AI PREPROCESS + CLASSIFICATION

\# =========================================================



def preprocess\_image\_from\_rgb(img\_rgb):

&#x20;   img = tf.convert\_to\_tensor(img\_rgb, dtype=tf.uint8)



&#x20;   gray = tf.image.rgb\_to\_grayscale(img)

&#x20;   gray = tf.cast(gray, tf.float32)



&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (gray - pmin) / (pmax - pmin + 1e-5)



&#x20;   final = 1.0 - stretched

&#x20;   final = tf.image.grayscale\_to\_rgb(final)



&#x20;   final = tf.image.resize\_with\_pad(

&#x20;       final,

&#x20;       IMG\_SIZE,

&#x20;       IMG\_SIZE

&#x20;   )



&#x20;   return final





def make\_model\_input(img\_rgb):

&#x20;   img = preprocess\_image\_from\_rgb(img\_rgb)

&#x20;   return tf.expand\_dims(img, axis=0)





def map\_class\_to\_pd\_source(class\_name):

&#x20;   if class\_name == "Corona":

&#x20;       return "Floating / Corona / Bad contact"

&#x20;   elif class\_name == "Surface":

&#x20;       return "Outside surface discharge"

&#x20;   elif class\_name == "Internal":

&#x20;       return "Internal"

&#x20;   elif class\_name == "Non-identified":

&#x20;       return "Manual confirmation required"

&#x20;   else:

&#x20;       return "Manual confirmation required"





def select\_pd\_source\_by\_confidence(corona\_pct, surface\_pct, internal\_pct):

&#x20;   """

&#x20;   PD source rule:

&#x20;   1) Surface > 60% and Internal > 60% -> Terminations / Joint

&#x20;   2) Corona > 80% -> Floating / Corona / Bad contact

&#x20;   3) Surface > 80% -> Outside surface discharge

&#x20;   4) Internal > 80% -> Internal

&#x20;   5) Otherwise -> top-class fallback recommendation

&#x20;   """



&#x20;   scores = {

&#x20;       "Corona": float(corona\_pct),

&#x20;       "Surface": float(surface\_pct),

&#x20;       "Internal": float(internal\_pct)

&#x20;   }



&#x20;   if scores\["Surface"] > 60 and scores\["Internal"] > 60:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Joint",

&#x20;           "pd\_source\_type": "Terminations / Joint",

&#x20;           "pd\_selection\_rule": "surface\_gt\_60\_and\_internal\_gt\_60",

&#x20;           "is\_strong\_rule": True

&#x20;       }



&#x20;   if scores\["Corona"] > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Corona",

&#x20;           "pd\_source\_type": "Floating / Corona / Bad contact",

&#x20;           "pd\_selection\_rule": "corona\_gt\_80",

&#x20;           "is\_strong\_rule": True

&#x20;       }



&#x20;   if scores\["Surface"] > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Surface",

&#x20;           "pd\_source\_type": "Outside surface discharge",

&#x20;           "pd\_selection\_rule": "surface\_gt\_80",

&#x20;           "is\_strong\_rule": True

&#x20;       }



&#x20;   if scores\["Internal"] > 80:

&#x20;       return {

&#x20;           "pd\_rule\_class": "Internal",

&#x20;           "pd\_source\_type": "Internal",

&#x20;           "pd\_selection\_rule": "internal\_gt\_80",

&#x20;           "is\_strong\_rule": True

&#x20;       }



&#x20;   top\_class = max(scores, key=scores.get)

&#x20;   top\_score = scores\[top\_class]



&#x20;   return {

&#x20;       "pd\_rule\_class": top\_class,

&#x20;       "pd\_source\_type": map\_class\_to\_pd\_source(top\_class),

&#x20;       "pd\_selection\_rule": f"top\_class\_fallback\_{top\_class.lower()}\_{top\_score:.2f}\_manual\_confirm",

&#x20;       "is\_strong\_rule": False

&#x20;   }





def make\_percent\_bar(percent, unit=5):

&#x20;   filled = int(float(percent) / unit)

&#x20;   return "█" \* filled





def print\_ai\_percent\_bars(scores\_percent, non\_identified\_percent):

&#x20;   print("\\nAI CLASS CONFIDENCE")

&#x20;   print("-" \* 80)



&#x20;   for i in range(3):

&#x20;       percent = float(scores\_percent\[i])

&#x20;       bar = make\_percent\_bar(percent)

&#x20;       print(f"{CLASS\_NAMES\[i]:<15} : {percent:>6.2f}% {bar}")



&#x20;   non\_bar = make\_percent\_bar(non\_identified\_percent)

&#x20;   print(f"{'Non-identified':<15} : {non\_identified\_percent:>6.2f}% {non\_bar}")





def make\_ai\_display\_text(ai):

&#x20;   """Display AI result without showing Non-identified as 100% confidence."""

&#x20;   if ai is None:

&#x20;       return "AI: Not executed"



&#x20;   if ai.get("final\_result", "") == "Non-identified":

&#x20;       return "AI result: Non-identified"



&#x20;   return f"AI top class: {ai.get('final\_result', '')} ({float(ai.get('final\_score', 0.0)):.2f}%)"





def make\_not\_measurable\_reason\_text(status):

&#x20;   """Convert auto detection status to a readable reason for UI / CSV / Excel."""

&#x20;   status = str(status)

&#x20;   mapping = {

&#x20;       "single\_discharge\_cluster\_detected\_negative\_only": "single discharge cluster detected on the negative half-cycle only",

&#x20;       "single\_discharge\_cluster\_detected\_positive\_only": "single discharge cluster detected on the positive half-cycle only",

&#x20;       "positive\_or\_negative\_cluster\_missing": "only one discharge cluster was detected",

&#x20;       "no\_clear\_discharge\_cluster\_detected": "no clear positive/negative discharge cluster pair was detected",

&#x20;       "clusters\_overlap\_or\_unclear": "positive and negative discharge clusters overlap or are unclear",

&#x20;       "gap\_too\_small\_or\_invalid": "gap between discharge clusters is too small or invalid",

&#x20;       "empty\_crop": "plot crop is empty or invalid",

&#x20;       "invalid\_calibration": "axis / plot-frame calibration is invalid",

&#x20;   }

&#x20;   return mapping.get(status, status.replace("\_", " "))





def is\_not\_measurable\_auto\_status(status):

&#x20;   """Statuses that should be treated as automatic Not measurable in Auto workflow."""

&#x20;   status = str(status)

&#x20;   return (

&#x20;       status.startswith("single\_discharge\_cluster\_detected")

&#x20;       or status in \[

&#x20;           "positive\_or\_negative\_cluster\_missing",

&#x20;           "no\_clear\_discharge\_cluster\_detected",

&#x20;           "clusters\_overlap\_or\_unclear",

&#x20;           "gap\_too\_small\_or\_invalid",

&#x20;       ]

&#x20;   )





def run\_hybrid\_ai(prpd\_rgb, tf\_rgb):

&#x20;   prpd\_input = make\_model\_input(prpd\_rgb)

&#x20;   tf\_input = make\_model\_input(tf\_rgb)



&#x20;   input\_names = \[inp.name.split(":")\[0].split("/")\[0] for inp in hybrid\_model.inputs]



&#x20;   try:

&#x20;       if "prpd\_input" in input\_names and "tf\_input" in input\_names:

&#x20;           preds = hybrid\_model.predict(

&#x20;               {

&#x20;                   "prpd\_input": prpd\_input,

&#x20;                   "tf\_input": tf\_input

&#x20;               },

&#x20;               verbose=0

&#x20;           )\[0]

&#x20;       else:

&#x20;           preds = hybrid\_model.predict(

&#x20;               \[prpd\_input, tf\_input],

&#x20;               verbose=0

&#x20;           )\[0]

&#x20;   except Exception:

&#x20;       preds = hybrid\_model.predict(

&#x20;           \[prpd\_input, tf\_input],

&#x20;           verbose=0

&#x20;       )\[0]



&#x20;   scores\_percent = np.array(preds \* 100.0).astype(float)



&#x20;   top\_idx = int(np.argmax(scores\_percent))

&#x20;   top\_class = CLASS\_NAMES\[top\_idx]

&#x20;   top\_score = float(scores\_percent\[top\_idx])



&#x20;   confidence\_dict = {

&#x20;       CLASS\_NAMES\[i]: float(scores\_percent\[i])

&#x20;       for i in range(3)

&#x20;   }



&#x20;   corona\_pct = confidence\_dict.get("Corona", 0.0)

&#x20;   surface\_pct = confidence\_dict.get("Surface", 0.0)

&#x20;   internal\_pct = confidence\_dict.get("Internal", 0.0)



&#x20;   all\_low = (

&#x20;       corona\_pct <= TOPCLASS\_THRESHOLD and

&#x20;       surface\_pct <= TOPCLASS\_THRESHOLD and

&#x20;       internal\_pct <= TOPCLASS\_THRESHOLD

&#x20;   )



&#x20;   if all\_low:

&#x20;       final\_result = "Non-identified"

&#x20;       final\_score = top\_score

&#x20;       status = "non\_identified\_all\_classes\_le\_30"

&#x20;       non\_identified\_percent = 100.0

&#x20;       high\_conf\_count = 0

&#x20;       pd\_rule\_result = {

&#x20;           "pd\_rule\_class": "Non-identified",

&#x20;           "pd\_source\_type": "Manual confirmation required",

&#x20;           "pd\_selection\_rule": "all\_classes\_le\_30\_manual\_confirmation\_required",

&#x20;           "is\_strong\_rule": False

&#x20;       }

&#x20;   else:

&#x20;       final\_result = top\_class

&#x20;       final\_score = top\_score

&#x20;       status = "identified\_by\_top\_class\_gt\_30"

&#x20;       non\_identified\_percent = 0.0

&#x20;       high\_conf\_count = int(np.sum(scores\_percent > TOPCLASS\_THRESHOLD))



&#x20;       pd\_rule\_result = select\_pd\_source\_by\_confidence(

&#x20;           corona\_pct=corona\_pct,

&#x20;           surface\_pct=surface\_pct,

&#x20;           internal\_pct=internal\_pct

&#x20;       )



&#x20;   return {

&#x20;       "mode": "HYBRID",

&#x20;       "input\_mode": "HYBRID\_PRPD\_TF",

&#x20;       "model\_used": "Model 3: PRPD\_3\_Hybrid",

&#x20;       "model\_path\_used": HYBRID\_MODEL\_PATH,



&#x20;       "raw\_prediction": preds,

&#x20;       "scores\_percent": scores\_percent,

&#x20;       "confidence\_dict": confidence\_dict,



&#x20;       "top\_class": top\_class,

&#x20;       "top\_score": top\_score,



&#x20;       "final\_result": final\_result,

&#x20;       "final\_score": float(final\_score),

&#x20;       "non\_identified\_percent": float(non\_identified\_percent),

&#x20;       "status": status,

&#x20;       "high\_conf\_count": int(high\_conf\_count),



&#x20;       "ai\_decision\_rule": "top\_class\_gt\_30\_else\_non\_identified",

&#x20;       "ai\_threshold\_percent": TOPCLASS\_THRESHOLD,



&#x20;       "pd\_rule\_class": pd\_rule\_result\["pd\_rule\_class"],

&#x20;       "pd\_selection\_rule": pd\_rule\_result\["pd\_selection\_rule"],

&#x20;       "suggested\_pd\_source": pd\_rule\_result\["pd\_source\_type"],

&#x20;       "is\_strong\_pd\_rule": pd\_rule\_result\["is\_strong\_rule"]

&#x20;   }



\# =========================================================

\# CALIBRATION PRESET MEMORY

\# =========================================================



def read\_calibration\_preset\_table():

&#x20;   if os.path.exists(CALIBRATION\_PRESET\_CSV):

&#x20;       return pd.read\_csv(CALIBRATION\_PRESET\_CSV)



&#x20;   return pd.DataFrame(columns=\[

&#x20;       "preset\_name",

&#x20;       "image\_width",

&#x20;       "image\_height",

&#x20;       "x\_left\_0deg",

&#x20;       "x\_right\_360deg",

&#x20;       "y\_top\_plot",

&#x20;       "y\_bottom\_plot",

&#x20;       "saved\_time",

&#x20;       "example\_prpd\_filename",

&#x20;       "example\_tf\_filename",

&#x20;       "remark"

&#x20;   ])





def save\_calibration\_preset\_to\_csv(

&#x20;   preset\_name,

&#x20;   image\_width,

&#x20;   image\_height,

&#x20;   x\_left\_0deg,

&#x20;   x\_right\_360deg,

&#x20;   y\_top\_plot,

&#x20;   y\_bottom\_plot,

&#x20;   remark=""

):

&#x20;   df\_old = read\_calibration\_preset\_table()



&#x20;   if len(df\_old) > 0:

&#x20;       df\_old = df\_old\[

&#x20;           \~(

&#x20;               (df\_old\["preset\_name"].astype(str) == str(preset\_name)) \&

&#x20;               (df\_old\["image\_width"].astype(int) == int(image\_width)) \&

&#x20;               (df\_old\["image\_height"].astype(int) == int(image\_height))

&#x20;           )

&#x20;       ].copy()



&#x20;   row = {

&#x20;       "preset\_name": preset\_name,

&#x20;       "image\_width": int(image\_width),

&#x20;       "image\_height": int(image\_height),

&#x20;       "x\_left\_0deg": int(x\_left\_0deg),

&#x20;       "x\_right\_360deg": int(x\_right\_360deg),

&#x20;       "y\_top\_plot": int(y\_top\_plot),

&#x20;       "y\_bottom\_plot": int(y\_bottom\_plot),

&#x20;       "saved\_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

&#x20;       "example\_prpd\_filename": state.get("prpd\_filename", ""),

&#x20;       "example\_tf\_filename": state.get("tf\_filename", ""),

&#x20;       "remark": remark

&#x20;   }



&#x20;   df\_new = pd.concat(\[df\_old, pd.DataFrame(\[row])], ignore\_index=True)

&#x20;   df\_new.to\_csv(CALIBRATION\_PRESET\_CSV, index=False)



&#x20;   return row





def find\_matching\_calibration\_preset(image\_width, image\_height, preset\_name=None):

&#x20;   df = read\_calibration\_preset\_table()



&#x20;   if len(df) == 0:

&#x20;       return None



&#x20;   df\_use = df\[

&#x20;       (df\["image\_width"].astype(int) == int(image\_width)) \&

&#x20;       (df\["image\_height"].astype(int) == int(image\_height))

&#x20;   ].copy()



&#x20;   if preset\_name is not None:

&#x20;       df\_use = df\_use\[df\_use\["preset\_name"].astype(str) == str(preset\_name)].copy()



&#x20;   if len(df\_use) == 0:

&#x20;       return None



&#x20;   df\_use = df\_use.sort\_values(by="saved\_time", ascending=False).reset\_index(drop=True)

&#x20;   return df\_use.iloc\[0].to\_dict()





def apply\_calibration\_preset\_row(preset\_row, redraw=True):

&#x20;   if preset\_row is None:

&#x20;       return False



&#x20;   x\_left\_slider.value = int(preset\_row\["x\_left\_0deg"])

&#x20;   x\_right\_slider.value = int(preset\_row\["x\_right\_360deg"])

&#x20;   y\_top\_slider.value = int(preset\_row\["y\_top\_plot"])

&#x20;   y\_bottom\_slider.value = int(preset\_row\["y\_bottom\_plot"])



&#x20;   calibration\_mode\_dropdown.value = "Manual calibration"



&#x20;   state\["calibration\_source"] = "saved\_calibration\_preset"

&#x20;   state\["calibration\_preset\_loaded"] = True



&#x20;   if redraw:

&#x20;       draw\_all()



&#x20;   return True





def update\_calibration\_preset\_status():

&#x20;   w, h = get\_current\_image\_size\_for\_preset()



&#x20;   if w is None:

&#x20;       calibration\_preset\_status\_html.value = (

&#x20;           "<b>Calibration Preset:</b> ยังไม่ได้โหลด PRPD image"

&#x20;       )

&#x20;       return



&#x20;   preset = find\_matching\_calibration\_preset(

&#x20;       image\_width=w,

&#x20;       image\_height=h,

&#x20;       preset\_name=make\_default\_preset\_name()

&#x20;   )



&#x20;   if preset is None:

&#x20;       calibration\_preset\_status\_html.value = (

&#x20;           f"<b>Calibration Preset:</b> ไม่พบ preset สำหรับภาพขนาด {w}×{h}"

&#x20;       )

&#x20;   else:

&#x20;       calibration\_preset\_status\_html.value = (

&#x20;           f"<b>Calibration Preset:</b> พบ preset สำหรับ {w}×{h}<br>"

&#x20;           f"<b>Preset:</b> {preset\['preset\_name']}<br>"

&#x20;           f"<b>Axis:</b> 0°={int(preset\['x\_left\_0deg'])}, "

&#x20;           f"360°={int(preset\['x\_right\_360deg'])}, "

&#x20;           f"Y top={int(preset\['y\_top\_plot'])}, "

&#x20;           f"Y bottom={int(preset\['y\_bottom\_plot'])}<br>"

&#x20;           f"<b>Saved:</b> {preset\['saved\_time']}"

&#x20;       )



\# =========================================================

\# GAP TIME FUNCTIONS

\# =========================================================



def pixel\_to\_phase\_deg(x\_pixel, x\_left, x\_right):

&#x20;   return (x\_pixel - x\_left) / (x\_right - x\_left) \* 360.0





def phase\_deg\_to\_pixel(phase\_deg, x\_left, x\_right):

&#x20;   return x\_left + (phase\_deg / 360.0) \* (x\_right - x\_left)





def gap\_angle\_to\_ms(gap\_angle\_deg):

&#x20;   return gap\_angle\_deg \* CYCLE\_TIME\_MS / 360.0





def gap\_time\_band(gap\_time\_ms):

&#x20;   if gap\_time\_ms is None or np.isnan(gap\_time\_ms):

&#x20;       return "Not measurable"

&#x20;   if gap\_time\_ms > 7:

&#x20;       return "> 7 ms"

&#x20;   elif 4 <= gap\_time\_ms <= 7:

&#x20;       return "4–7 ms"

&#x20;   else:

&#x20;       return "< 4 ms"





def severity\_from\_gap\_time\_and\_source(gap\_time\_ms, pd\_source\_type):

&#x20;   if gap\_time\_ms is None or np.isnan(gap\_time\_ms):

&#x20;       return "Not measurable"



&#x20;   if pd\_source\_type in \[

&#x20;       "Floating / Corona / Bad contact",

&#x20;       "Outside surface discharge"

&#x20;   ]:

&#x20;       if gap\_time\_ms > 7:

&#x20;           return "Initial"

&#x20;       elif 4 <= gap\_time\_ms <= 7:

&#x20;           return "Moderate"

&#x20;       else:

&#x20;           return "High"



&#x20;   elif pd\_source\_type in \[

&#x20;       "Terminations / Joint",

&#x20;       "Internal"

&#x20;   ]:

&#x20;       if gap\_time\_ms > 7:

&#x20;           return "Moderate"

&#x20;       elif 4 <= gap\_time\_ms <= 7:

&#x20;           return "High"

&#x20;       else:

&#x20;           return "High"



&#x20;   return "Unknown"





def detect\_prpd\_plot\_frame(img\_bgr):

&#x20;   gray = cv2.cvtColor(img\_bgr, cv2.COLOR\_BGR2GRAY)



&#x20;   blur = cv2.GaussianBlur(gray, (3, 3), 0)

&#x20;   edges = cv2.Canny(blur, 50, 150)



&#x20;   kernel = np.ones((3, 3), np.uint8)

&#x20;   edges\_dilated = cv2.dilate(edges, kernel, iterations=1)



&#x20;   contours, \_ = cv2.findContours(

&#x20;       edges\_dilated,

&#x20;       cv2.RETR\_EXTERNAL,

&#x20;       cv2.CHAIN\_APPROX\_SIMPLE

&#x20;   )



&#x20;   candidates = \[]

&#x20;   img\_h, img\_w = gray.shape

&#x20;   img\_area = img\_w \* img\_h



&#x20;   for cnt in contours:

&#x20;       x, y, ww, hh = cv2.boundingRect(cnt)

&#x20;       area = ww \* hh



&#x20;       if area < 0.08 \* img\_area:

&#x20;           continue

&#x20;       if area > 0.90 \* img\_area:

&#x20;           continue

&#x20;       if ww < 0.35 \* img\_w:

&#x20;           continue

&#x20;       if hh < 0.25 \* img\_h:

&#x20;           continue



&#x20;       aspect = ww / max(hh, 1)



&#x20;       if aspect < 0.8 or aspect > 2.5:

&#x20;           continue



&#x20;       cx = x + ww / 2

&#x20;       cy = y + hh / 2



&#x20;       center\_score = 1.0 - (

&#x20;           abs(cx - img\_w / 2) / (img\_w / 2) \* 0.5

&#x20;           + abs(cy - img\_h / 2) / (img\_h / 2) \* 0.5

&#x20;       )



&#x20;       score = area \* center\_score



&#x20;       candidates.append({

&#x20;           "x": x,

&#x20;           "y": y,

&#x20;           "w": ww,

&#x20;           "h": hh,

&#x20;           "area": area,

&#x20;           "aspect": aspect,

&#x20;           "score": score

&#x20;       })



&#x20;   if len(candidates) > 0:

&#x20;       best = sorted(candidates, key=lambda d: d\["score"], reverse=True)\[0]



&#x20;       x\_left = best\["x"]

&#x20;       x\_right = best\["x"] + best\["w"]

&#x20;       y\_top = best\["y"]

&#x20;       y\_bottom = best\["y"] + best\["h"]



&#x20;       return x\_left, x\_right, y\_top, y\_bottom, "auto\_contour\_detected"



&#x20;   return (

&#x20;       int(img\_w \* 0.18),

&#x20;       int(img\_w \* 0.88),

&#x20;       int(img\_h \* 0.15),

&#x20;       int(img\_h \* 0.85),

&#x20;       "auto\_failed\_manual\_required"

&#x20;   )





def clean\_binary\_mask(binary\_mask, min\_area=2, max\_area=None):

&#x20;   m = (binary\_mask.astype(np.uint8) \* 255)

&#x20;   m = cv2.medianBlur(m, 3)



&#x20;   num\_labels, labels, stats, \_ = cv2.connectedComponentsWithStats(

&#x20;       m,

&#x20;       connectivity=8

&#x20;   )



&#x20;   clean = np.zeros\_like(m)



&#x20;   if max\_area is None:

&#x20;       max\_area = m.shape\[0] \* m.shape\[1]



&#x20;   for i in range(1, num\_labels):

&#x20;       area = stats\[i, cv2.CC\_STAT\_AREA]

&#x20;       if min\_area <= area <= max\_area:

&#x20;           clean\[labels == i] = 255



&#x20;   return clean > 0





def auto\_detect\_gap\_lines(img\_rgb, x\_left, x\_right, y\_top, y\_bottom):

&#x20;   crop = img\_rgb\[y\_top:y\_bottom, x\_left:x\_right].copy()



&#x20;   if crop.size == 0:

&#x20;       return None, "empty\_crop"



&#x20;   crop\_h, crop\_w, \_ = crop.shape



&#x20;   hsv = cv2.cvtColor(crop, cv2.COLOR\_RGB2HSV)

&#x20;   gray = cv2.cvtColor(crop, cv2.COLOR\_RGB2GRAY)



&#x20;   dark\_mask = gray < 165

&#x20;   color\_mask = (hsv\[:, :, 1] > 35) \& (hsv\[:, :, 2] < 250)



&#x20;   mask = dark\_mask | color\_mask



&#x20;   border\_x = max(3, int(0.02 \* crop\_w))

&#x20;   border\_y = max(3, int(0.02 \* crop\_h))



&#x20;   mask\[:, :border\_x] = False

&#x20;   mask\[:, -border\_x:] = False

&#x20;   mask\[:border\_y, :] = False

&#x20;   mask\[-border\_y:, :] = False



&#x20;   y\_mid = crop\_h // 2

&#x20;   axis\_band = max(3, int(0.025 \* crop\_h))



&#x20;   mask\[max(0, y\_mid-axis\_band):min(crop\_h, y\_mid+axis\_band+1), :] = False



&#x20;   positive\_mask = np.zeros\_like(mask)

&#x20;   negative\_mask = np.zeros\_like(mask)



&#x20;   positive\_mask\[:y\_mid-axis\_band, :] = mask\[:y\_mid-axis\_band, :]

&#x20;   negative\_mask\[y\_mid+axis\_band:, :] = mask\[y\_mid+axis\_band:, :]



&#x20;   max\_component\_area = int(0.30 \* crop\_w \* crop\_h)



&#x20;   positive\_mask = clean\_binary\_mask(

&#x20;       positive\_mask,

&#x20;       min\_area=2,

&#x20;       max\_area=max\_component\_area

&#x20;   )



&#x20;   negative\_mask = clean\_binary\_mask(

&#x20;       negative\_mask,

&#x20;       min\_area=2,

&#x20;       max\_area=max\_component\_area

&#x20;   )



&#x20;   pos\_y, pos\_x = np.where(positive\_mask)

&#x20;   neg\_y, neg\_x = np.where(negative\_mask)



&#x20;   # ถ้าเจอ discharge cluster แค่ฝั่งเดียว ให้ถือว่า Gap-time วัดไม่ได้

&#x20;   # เพราะไม่มีคู่ cluster ซ้าย/ขวาให้กำหนดขอบ discharge ได้ครบ

&#x20;   if len(pos\_x) < 10 and len(neg\_x) >= 10:

&#x20;       return None, "single\_discharge\_cluster\_detected\_negative\_only"



&#x20;   if len(neg\_x) < 10 and len(pos\_x) >= 10:

&#x20;       return None, "single\_discharge\_cluster\_detected\_positive\_only"



&#x20;   if len(pos\_x) < 10 and len(neg\_x) < 10:

&#x20;       return None, "no\_clear\_discharge\_cluster\_detected"



&#x20;   pos\_left = int(np.percentile(pos\_x, 5))

&#x20;   pos\_right = int(np.percentile(pos\_x, 95))



&#x20;   neg\_left = int(np.percentile(neg\_x, 5))

&#x20;   neg\_right = int(np.percentile(neg\_x, 95))



&#x20;   if neg\_right < pos\_left:

&#x20;       left\_line\_crop\_x = neg\_right

&#x20;       right\_line\_crop\_x = pos\_left

&#x20;       detected\_case = "negative\_left\_positive\_right"



&#x20;   elif pos\_right < neg\_left:

&#x20;       left\_line\_crop\_x = pos\_right

&#x20;       right\_line\_crop\_x = neg\_left

&#x20;       detected\_case = "positive\_left\_negative\_right"



&#x20;   else:

&#x20;       return None, "clusters\_overlap\_or\_unclear"



&#x20;   gap\_width = right\_line\_crop\_x - left\_line\_crop\_x



&#x20;   if gap\_width < 3:

&#x20;       return None, "gap\_too\_small\_or\_invalid"



&#x20;   left\_line\_x = x\_left + int(left\_line\_crop\_x)

&#x20;   right\_line\_x = x\_left + int(right\_line\_crop\_x)



&#x20;   return {

&#x20;       "left\_line\_x": left\_line\_x,

&#x20;       "right\_line\_x": right\_line\_x,

&#x20;       "positive\_x\_range\_pixel": (x\_left + pos\_left, x\_left + pos\_right),

&#x20;       "negative\_x\_range\_pixel": (x\_left + neg\_left, x\_left + neg\_right),

&#x20;       "positive\_x\_range\_phase": (

&#x20;           pixel\_to\_phase\_deg(x\_left + pos\_left, x\_left, x\_right),

&#x20;           pixel\_to\_phase\_deg(x\_left + pos\_right, x\_left, x\_right)

&#x20;       ),

&#x20;       "negative\_x\_range\_phase": (

&#x20;           pixel\_to\_phase\_deg(x\_left + neg\_left, x\_left, x\_right),

&#x20;           pixel\_to\_phase\_deg(x\_left + neg\_right, x\_left, x\_right)

&#x20;       ),

&#x20;       "gap\_width\_pixel": gap\_width,

&#x20;       "detected\_case": detected\_case,

&#x20;       "pos\_points": len(pos\_x),

&#x20;       "neg\_points": len(neg\_x),

&#x20;   }, "auto\_detected\_positive\_negative"



\# =========================================================

\# WIDGETS

\# =========================================================



defect\_filter\_dropdown = widgets.Dropdown(

&#x20;   options=\[

&#x20;       ("All remaining defects", "ALL"),

&#x20;       ("1 - improper void termination", 1),

&#x20;       ("2 - termination overlap", 2),

&#x20;       ("3 - sandpaper-scrubbed defect", 3),

&#x20;       ("4 - absence of stress control", 4),

&#x20;       ("5 - void-related internal defect", 5),

&#x20;   ],

&#x20;   value="ALL",

&#x20;   description="Defect filter:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="560px")

)



case\_select = widgets.Select(

&#x20;   options=\[],

&#x20;   description="Case:",

&#x20;   rows=8,

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="980px", height="230px")

)



load\_case\_button = widgets.Button(

&#x20;   description="Load Selected Case",

&#x20;   button\_style="primary",

&#x20;   layout=widgets.Layout(width="220px")

)



load\_next\_button = widgets.Button(

&#x20;   description="Load Next Case",

&#x20;   button\_style="info",

&#x20;   layout=widgets.Layout(width="180px")

)



auto\_next\_checkbox = widgets.Checkbox(

&#x20;   value=True,

&#x20;   description="Auto-load next case after Accept and Save",

&#x20;   indent=False,

&#x20;   layout=widgets.Layout(width="420px")

)



case\_progress\_html = widgets.HTML("")

resume\_status\_html = widgets.HTML("")



loader\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="1px solid #444",

&#x20;       padding="4px",

&#x20;       height="280px",

&#x20;       overflow\_y="auto"

&#x20;   )

)



status\_html = widgets.HTML("<b>Status:</b> ยังไม่ได้โหลดเคส")



ai\_locked\_panel = widgets.HTML(

&#x20;   value="""

&#x20;   <div style="

&#x20;       position: sticky;

&#x20;       top: 0;

&#x20;       z-index: 999;

&#x20;       background: #111827;

&#x20;       color: white;

&#x20;       border: 2px solid #38bdf8;

&#x20;       border-radius: 10px;

&#x20;       padding: 12px;

&#x20;       margin: 8px 0;

&#x20;       font-size: 15px;

&#x20;       line-height: 1.55;

&#x20;   ">

&#x20;       <b>AI RESULT PANEL:</b> ยังไม่ได้โหลดเคส

&#x20;   </div>

&#x20;   """

)



calibration\_mode\_dropdown = widgets.Dropdown(

&#x20;   options=\[

&#x20;       "Use default PDProcessingII calibration",

&#x20;       "Use auto-detected calibration",

&#x20;       "Manual calibration"

&#x20;   ],

&#x20;   value="Use auto-detected calibration",

&#x20;   description="Calibration mode:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="560px")

)



x\_left\_slider = widgets.IntSlider(description="0 deg", continuous\_update=False, layout=widgets.Layout(width="520px"))

x\_right\_slider = widgets.IntSlider(description="360 deg", continuous\_update=False, layout=widgets.Layout(width="520px"))

y\_top\_slider = widgets.IntSlider(description="Y top", continuous\_update=False, layout=widgets.Layout(width="520px"))

y\_bottom\_slider = widgets.IntSlider(description="Y bottom", continuous\_update=False, layout=widgets.Layout(width="520px"))



left\_line\_slider = widgets.IntSlider(description="Left line", continuous\_update=False, layout=widgets.Layout(width="520px"))

right\_line\_slider = widgets.IntSlider(description="Right line", continuous\_update=False, layout=widgets.Layout(width="520px"))



pd\_source\_dropdown = widgets.Dropdown(

&#x20;   options=PD\_SOURCE\_OPTIONS,

&#x20;   value="Outside surface discharge",

&#x20;   description="PD source:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="620px")

)



reviewer\_name\_text = widgets.Text(

&#x20;   value="",

&#x20;   placeholder="Reviewer name",

&#x20;   description="Reviewer name:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="420px")

)



reviewer\_role\_dropdown = widgets.Dropdown(

&#x20;   options=\["researcher", "expert", "advisor", "operator", "student", "other"],

&#x20;   value="researcher",

&#x20;   description="Reviewer role:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="420px")

)



review\_status\_dropdown = widgets.Dropdown(

&#x20;   options=\["user\_confirmed", "expert\_confirmed", "advisor\_confirmed", "need\_review", "auto\_saved"],

&#x20;   value="user\_confirmed",

&#x20;   description="Review status:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="420px")

)



review\_note\_text = widgets.Textarea(

&#x20;   value="",

&#x20;   placeholder="Optional note",

&#x20;   description="Review note:",

&#x20;   style={"description\_width": "initial"},

&#x20;   layout=widgets.Layout(width="780px", height="70px")

)



save\_reviewer\_button = widgets.Button(

&#x20;   description="Save Reviewer Name",

&#x20;   button\_style="success",

&#x20;   layout=widgets.Layout(width="220px")

)



reviewer\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="1px solid #777",

&#x20;       padding="6px",

&#x20;       height="120px",

&#x20;       overflow\_y="auto"

&#x20;   )

)





btn\_x\_left\_minus = widgets.Button(description="0° -1")

btn\_x\_left\_plus = widgets.Button(description="0° +1")

btn\_x\_right\_minus = widgets.Button(description="360° -1")

btn\_x\_right\_plus = widgets.Button(description="360° +1")



btn\_y\_top\_minus = widgets.Button(description="Y top -1")

btn\_y\_top\_plus = widgets.Button(description="Y top +1")

btn\_y\_bottom\_minus = widgets.Button(description="Y bottom -1")

btn\_y\_bottom\_plus = widgets.Button(description="Y bottom +1")



btn\_left\_minus = widgets.Button(description="Left -1", button\_style="warning")

btn\_left\_plus = widgets.Button(description="Left +1", button\_style="warning")

btn\_right\_minus = widgets.Button(description="Right -1", button\_style="success")

btn\_right\_plus = widgets.Button(description="Right +1", button\_style="success")



btn\_redetect = widgets.Button(description="Re-detect Gap Lines", button\_style="info")

btn\_accept = widgets.Button(description="Accept and Save", button\_style="success")

btn\_not\_measurable = widgets.Button(description="Not Measurable", button\_style="danger")



save\_calibration\_preset\_button = widgets.Button(

&#x20;   description="Save Calibration Preset",

&#x20;   button\_style="success",

&#x20;   layout=widgets.Layout(width="240px")

)



load\_calibration\_preset\_button = widgets.Button(

&#x20;   description="Load Calibration Preset",

&#x20;   button\_style="info",

&#x20;   layout=widgets.Layout(width="240px")

)



clear\_calibration\_preset\_button = widgets.Button(

&#x20;   description="Clear Calibration Preset",

&#x20;   button\_style="danger",

&#x20;   layout=widgets.Layout(width="240px")

)



calibration\_preset\_status\_html = widgets.HTML(

&#x20;   value="<b>Calibration Preset:</b> not checked yet"

)



calibration\_preset\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="1px solid #888",

&#x20;       padding="6px",

&#x20;       height="180px",

&#x20;       overflow\_y="auto"

&#x20;   )

)



plot\_output = widgets.Output(

&#x20;   layout=widgets.Layout(

&#x20;       border="2px solid #00bcd4",

&#x20;       padding="6px",

&#x20;       height="720px",

&#x20;       overflow\_y="auto"

&#x20;   )

)





\# =========================================================

\# REVIEWER CONFIG

\# ใส่ชื่อครั้งเดียว แล้วระบบจะใช้ซ้ำตอน save ทุก case

\# =========================================================



def load\_reviewer\_config():

&#x20;   if os.path.exists(REVIEWER\_CONFIG\_CSV):

&#x20;       try:

&#x20;           df = pd.read\_csv(REVIEWER\_CONFIG\_CSV)

&#x20;           if len(df) > 0:

&#x20;               row = df.iloc\[-1].to\_dict()

&#x20;               return {

&#x20;                   "reviewer\_name": str(row.get("reviewer\_name", "unknown\_reviewer")),

&#x20;                   "reviewer\_role": str(row.get("reviewer\_role", "researcher")),

&#x20;                   "review\_status": str(row.get("review\_status", "user\_confirmed")),

&#x20;                   "review\_note": str(row.get("review\_note", "")),

&#x20;               }

&#x20;       except Exception:

&#x20;           pass



&#x20;   return {

&#x20;       "reviewer\_name": "unknown\_reviewer",

&#x20;       "reviewer\_role": "researcher",

&#x20;       "review\_status": "user\_confirmed",

&#x20;       "review\_note": "",

&#x20;   }





def save\_reviewer\_config():

&#x20;   name = reviewer\_name\_text.value.strip()

&#x20;   if name == "":

&#x20;       name = "unknown\_reviewer"



&#x20;   row = {

&#x20;       "reviewer\_name": name,

&#x20;       "reviewer\_role": reviewer\_role\_dropdown.value,

&#x20;       "review\_status": review\_status\_dropdown.value,

&#x20;       "review\_note": review\_note\_text.value,

&#x20;       "updated\_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

&#x20;   }



&#x20;   pd.DataFrame(\[row]).to\_csv(REVIEWER\_CONFIG\_CSV, index=False)

&#x20;   return row





def apply\_reviewer\_config\_to\_widgets():

&#x20;   cfg = load\_reviewer\_config()

&#x20;   reviewer\_name\_text.value = cfg\["reviewer\_name"]



&#x20;   if cfg\["reviewer\_role"] in list(reviewer\_role\_dropdown.options):

&#x20;       reviewer\_role\_dropdown.value = cfg\["reviewer\_role"]



&#x20;   if cfg\["review\_status"] in list(review\_status\_dropdown.options):

&#x20;       review\_status\_dropdown.value = cfg\["review\_status"]



&#x20;   review\_note\_text.value = cfg\["review\_note"]





def on\_save\_reviewer\_clicked(b=None):

&#x20;   with reviewer\_output:

&#x20;       clear\_output(wait=True)

&#x20;       cfg = save\_reviewer\_config()

&#x20;       print("=" \* 80)

&#x20;       print("REVIEWER CONFIG SAVED")

&#x20;       print("=" \* 80)

&#x20;       print("Reviewer name :", cfg\["reviewer\_name"])

&#x20;       print("Reviewer role :", cfg\["reviewer\_role"])

&#x20;       print("Review status :", cfg\["review\_status"])

&#x20;       print("Config CSV    :", REVIEWER\_CONFIG\_CSV)





save\_reviewer\_button.on\_click(on\_save\_reviewer\_clicked)

apply\_reviewer\_config\_to\_widgets()



\# =========================================================

\# EXCEL REVIEW OUTPUT

\# =========================================================



EXCEL\_COLUMNS = \[

&#x20;   "No.",

&#x20;   "Image",

&#x20;   "record\_id",

&#x20;   "defect\_id",

&#x20;   "defect\_name",

&#x20;   "case\_base\_name",

&#x20;   "prpd\_filename",

&#x20;   "tf\_filename",



&#x20;   "ai\_confidence\_corona",

&#x20;   "ai\_confidence\_surface",

&#x20;   "ai\_confidence\_internal",

&#x20;   "ai\_top\_class",

&#x20;   "ai\_top\_score\_percent",

&#x20;   "ai\_final\_result",

&#x20;   "ai\_final\_score\_percent",

&#x20;   "ai\_status",

&#x20;   "ai\_decision\_rule",

&#x20;   "ai\_threshold\_percent",



&#x20;   "suggested\_pd\_source\_type",

&#x20;   "confirmed\_pd\_source\_type",



&#x20;   "gap\_angle\_deg",

&#x20;   "gap\_time\_ms",

&#x20;   "gap\_time\_band",

&#x20;   "severity\_by\_gap\_time",



&#x20;   "left\_line\_pixel",

&#x20;   "right\_line\_pixel",

&#x20;   "left\_phase\_deg",

&#x20;   "right\_phase\_deg",



&#x20;   "gap\_measurement\_status",

&#x20;   "review\_status",

&#x20;   "reviewer\_name",

&#x20;   "reviewer\_role",

&#x20;   "review\_note",



&#x20;   "annotated\_image\_path",

&#x20;   "result\_folder",

&#x20;   "original\_prpd\_path",

&#x20;   "original\_tf\_path",

&#x20;   "per\_image\_csv\_path",



&#x20;   "created\_time",

&#x20;   "updated\_time",

]





def init\_review\_excel(excel\_path):

&#x20;   if os.path.exists(excel\_path):

&#x20;       return



&#x20;   wb = Workbook()

&#x20;   ws = wb.active

&#x20;   ws.title = "Model4AutoReview"

&#x20;   ws.append(EXCEL\_COLUMNS)



&#x20;   header\_fill = PatternFill("solid", fgColor="D9EAF7")

&#x20;   header\_font = Font(bold=True)

&#x20;   thin = Side(border\_style="thin", color="999999")



&#x20;   for cell in ws\[1]:

&#x20;       cell.fill = header\_fill

&#x20;       cell.font = header\_font

&#x20;       cell.alignment = Alignment(horizontal="center", vertical="center", wrap\_text=True)

&#x20;       cell.border = Border(top=thin, bottom=thin, left=thin, right=thin)



&#x20;   widths = {

&#x20;       "A": 8, "B": 24, "C": 22, "D": 12, "E": 28, "F": 24,

&#x20;       "G": 28, "H": 28, "I": 16, "J": 16, "K": 16,

&#x20;       "L": 16, "M": 18, "N": 18, "O": 18, "P": 28,

&#x20;       "Q": 32, "R": 16, "S": 30, "T": 30,

&#x20;       "U": 16, "V": 14, "W": 14, "X": 18,

&#x20;       "Y": 16, "Z": 16, "AA": 16, "AB": 16,

&#x20;       "AC": 22, "AD": 18, "AE": 20, "AF": 18, "AG": 30,

&#x20;       "AH": 48, "AI": 44, "AJ": 44, "AK": 44, "AL": 44,

&#x20;       "AM": 22, "AN": 22,

&#x20;   }



&#x20;   for col, width in widths.items():

&#x20;       ws.column\_dimensions\[col].width = width



&#x20;   ws.freeze\_panes = "A2"

&#x20;   wb.save(excel\_path)





def append\_result\_to\_excel(row, excel\_path=MASTER\_EXCEL\_PATH):

&#x20;   init\_review\_excel(excel\_path)



&#x20;   wb = load\_workbook(excel\_path)

&#x20;   ws = wb\["Model4AutoReview"]



&#x20;   next\_no = ws.max\_row

&#x20;   next\_row = ws.max\_row + 1



&#x20;   excel\_row = dict(row)

&#x20;   excel\_row\["No."] = next\_no

&#x20;   excel\_row\["Image"] = "Image"



&#x20;   ws.append(\[excel\_row.get(col, "") for col in EXCEL\_COLUMNS])

&#x20;   ws.row\_dimensions\[next\_row].height = 95



&#x20;   for cell in ws\[next\_row]:

&#x20;       cell.alignment = Alignment(horizontal="center", vertical="center", wrap\_text=True)



&#x20;   img\_path = row.get("annotated\_image\_path", "")



&#x20;   if img\_path and os.path.exists(img\_path):

&#x20;       img\_cell = f"B{next\_row}"

&#x20;       ws\[img\_cell] = "Image"

&#x20;       ws\[img\_cell].hyperlink = img\_path

&#x20;       ws\[img\_cell].style = "Hyperlink"



&#x20;       try:

&#x20;           img = XLImage(img\_path)

&#x20;           img.width = 150

&#x20;           img.height = 95

&#x20;           ws.add\_image(img, img\_cell)

&#x20;       except Exception as e:

&#x20;           print("WARNING: Cannot embed image into Excel:", e)



&#x20;   wb.save(excel\_path)





def append\_result\_to\_reviewer\_excel(row):

&#x20;   reviewer\_name = row.get("reviewer\_name", "unknown\_reviewer")

&#x20;   reviewer\_name = reviewer\_name if str(reviewer\_name).strip() != "" else "unknown\_reviewer"



&#x20;   reviewer\_excel\_dir = os.path.join(REVIEWER\_ROOT\_DIR, safe\_text\_name(reviewer\_name), "excel")

&#x20;   os.makedirs(reviewer\_excel\_dir, exist\_ok=True)



&#x20;   reviewer\_excel = os.path.join(

&#x20;       reviewer\_excel\_dir,

&#x20;       f"CMD\_model4\_auto\_review\_results\_{safe\_text\_name(reviewer\_name)}.xlsx"

&#x20;   )



&#x20;   append\_result\_to\_excel(row, reviewer\_excel)

&#x20;   return reviewer\_excel



\# =========================================================

\# LOCKED AI PANEL

\# =========================================================



def update\_ai\_locked\_panel():

&#x20;   if state.get("ai\_result", None) is None:

&#x20;       ai\_locked\_panel.value = """

&#x20;       <div style="

&#x20;           position: sticky;

&#x20;           top: 0;

&#x20;           z-index: 999;

&#x20;           background: #111827;

&#x20;           color: white;

&#x20;           border: 2px solid #38bdf8;

&#x20;           border-radius: 10px;

&#x20;           padding: 12px;

&#x20;           margin: 8px 0;

&#x20;           font-size: 15px;

&#x20;           line-height: 1.55;

&#x20;       ">

&#x20;           <b>AI RESULT PANEL:</b> No case loaded yet.

&#x20;       </div>

&#x20;       """

&#x20;       return



&#x20;   ai = state\["ai\_result"]

&#x20;   cd = ai\["confidence\_dict"]



&#x20;   corona = cd.get("Corona", 0.0)

&#x20;   surface = cd.get("Surface", 0.0)

&#x20;   internal = cd.get("Internal", 0.0)



&#x20;   prpd\_name = state.get("prpd\_filename", "")

&#x20;   tf\_name = state.get("tf\_filename", "")



&#x20;   strong\_text = "STRONG RULE" if ai.get("is\_strong\_pd\_rule", False) else "TOP CLASS FALLBACK - PLEASE CONFIRM"

&#x20;   ai\_display = make\_ai\_display\_text(ai)



&#x20;   ai\_locked\_panel.value = f"""

&#x20;   <div style="

&#x20;       position: sticky;

&#x20;       top: 0;

&#x20;       z-index: 999;

&#x20;       background: #111827;

&#x20;       color: white;

&#x20;       border: 2px solid #38bdf8;

&#x20;       border-radius: 10px;

&#x20;       padding: 12px;

&#x20;       margin: 8px 0;

&#x20;       font-size: 15px;

&#x20;       line-height: 1.55;

&#x20;   ">

&#x20;       <div style="font-size:18px; font-weight:700; color:#7dd3fc;">

&#x20;           LOCKED AI RESULT

&#x20;       </div>



&#x20;       <b>PRPD:</b> {prpd\_name}<br>

&#x20;       <b>TF:</b> {tf\_name}<br>



&#x20;       <hr style="border:0; border-top:1px solid #334155; margin:8px 0;">



&#x20;       <b>AI display:</b> {ai\_display}<br>

&#x20;       <b>AI final result:</b> {ai\["final\_result"]}<br>

&#x20;       <b>AI status:</b> {ai\["status"]}<br>

&#x20;       <b>Decision rule:</b> {ai.get("ai\_decision\_rule", "")}<br>

&#x20;       <b>Threshold:</b> {ai.get("ai\_threshold\_percent", TOPCLASS\_THRESHOLD):.2f}%<br>

&#x20;       <b>Top class:</b> {ai\["top\_class"]} ({ai\["top\_score"]:.2f}%)<br>



&#x20;       <hr style="border:0; border-top:1px solid #334155; margin:8px 0;">



&#x20;       <b>Corona:</b> {corona:.2f}% \&nbsp; | \&nbsp;

&#x20;       <b>Surface:</b> {surface:.2f}% \&nbsp; | \&nbsp;

&#x20;       <b>Internal:</b> {internal:.2f}%<br>



&#x20;       <b>PD rule class:</b> {ai\["pd\_rule\_class"]}<br>

&#x20;       <b>PD selection rule:</b> {ai\["pd\_selection\_rule"]}<br>

&#x20;       <b>Rule type:</b> {strong\_text}<br>

&#x20;       <b>Suggested PD source:</b>

&#x20;       <span style="color:#facc15; font-weight:700;">

&#x20;           {ai\["suggested\_pd\_source"]}

&#x20;       </span>

&#x20;   </div>

&#x20;   """



\# =========================================================

\# CASE LIST

\# =========================================================



def update\_progress\_html():

&#x20;   df\_use = level\_state.get("current\_df", None)



&#x20;   if df\_use is None or len(df\_use) == 0:

&#x20;       case\_progress\_html.value = "<b>Progress:</b> no remaining cases"

&#x20;       return



&#x20;   pos = level\_state.get("current\_position", 0)

&#x20;   total = len(df\_use)



&#x20;   pos = max(0, min(pos, total - 1))

&#x20;   row = df\_use.iloc\[pos]



&#x20;   case\_progress\_html.value = (

&#x20;       f"<b>Progress:</b> {pos + 1} / {total} remaining \&nbsp; | \&nbsp; "

&#x20;       f"<b>Current:</b> \[{row\['defect\_id']}] {row\['defect\_name']} / {row\['case\_base\_name']}"

&#x20;   )





def update\_case\_select(change=None):

&#x20;   df\_use = get\_filtered\_dataframe()



&#x20;   level\_state\["current\_df"] = df\_use

&#x20;   level\_state\["current\_position"] = 0



&#x20;   options = \[]



&#x20;   for pos, row in df\_use.iterrows():

&#x20;       original\_idx = get\_original\_index\_from\_row(row)

&#x20;       if original\_idx is None:

&#x20;           continue



&#x20;       label = make\_case\_label(row)

&#x20;       options.append((label, int(original\_idx)))



&#x20;   case\_select.options = options



&#x20;   if len(options) > 0:

&#x20;       case\_select.value = options\[0]\[1]



&#x20;   update\_progress\_html()



&#x20;   with loader\_output:

&#x20;       clear\_output(wait=True)

&#x20;       print("=" \* 100)

&#x20;       print("CASE LIST UPDATED")

&#x20;       print("=" \* 100)

&#x20;       print("Filter:", defect\_filter\_dropdown.label)

&#x20;       print("Cases available:", len(options))

&#x20;       print("เลือกเคส แล้วกด Load Selected Case")



defect\_filter\_dropdown.observe(update\_case\_select, names="value")





def update\_position\_from\_select(change=None):

&#x20;   if level\_state\["current\_df"] is None:

&#x20;       return



&#x20;   selected\_idx = case\_select.value

&#x20;   df\_use = level\_state\["current\_df"]



&#x20;   for pos, row in df\_use.iterrows():

&#x20;       original\_idx = get\_original\_index\_from\_row(row)



&#x20;       if original\_idx == selected\_idx:

&#x20;           level\_state\["current\_position"] = int(pos)

&#x20;           level\_state\["current\_original\_index"] = int(selected\_idx)

&#x20;           break



&#x20;   update\_progress\_html()



case\_select.observe(update\_position\_from\_select, names="value")





def update\_auto\_next(change=None):

&#x20;   level\_state\["auto\_next\_enabled"] = bool(auto\_next\_checkbox.value)



auto\_next\_checkbox.observe(update\_auto\_next, names="value")



\# =========================================================

\# SETUP CALIBRATION / GAP LINES

\# =========================================================



def setup\_sliders\_after\_image\_load():

&#x20;   img\_rgb = state\["prpd\_rgb"]

&#x20;   h, w = img\_rgb.shape\[:2]



&#x20;   state\["image\_width"] = w

&#x20;   state\["image\_height"] = h



&#x20;   state\["default\_size\_match"] = (

&#x20;       w == DEFAULT\_IMAGE\_WIDTH and h == DEFAULT\_IMAGE\_HEIGHT

&#x20;   )



&#x20;   img\_bgr = cv2.cvtColor(img\_rgb, cv2.COLOR\_RGB2BGR)



&#x20;   auto\_x\_left, auto\_x\_right, auto\_y\_top, auto\_y\_bottom, auto\_status = detect\_prpd\_plot\_frame(img\_bgr)



&#x20;   state\["auto\_x\_left"] = int(auto\_x\_left)

&#x20;   state\["auto\_x\_right"] = int(auto\_x\_right)

&#x20;   state\["auto\_y\_top"] = int(auto\_y\_top)

&#x20;   state\["auto\_y\_bottom"] = int(auto\_y\_bottom)

&#x20;   state\["auto\_calibration\_status"] = auto\_status



&#x20;   for slider in \[x\_left\_slider, x\_right\_slider, left\_line\_slider, right\_line\_slider]:

&#x20;       slider.min = 0

&#x20;       slider.max = w - 1

&#x20;       slider.step = 1



&#x20;   for slider in \[y\_top\_slider, y\_bottom\_slider]:

&#x20;       slider.min = 0

&#x20;       slider.max = h - 1

&#x20;       slider.step = 1



&#x20;   preset = find\_matching\_calibration\_preset(

&#x20;       image\_width=w,

&#x20;       image\_height=h,

&#x20;       preset\_name=make\_default\_preset\_name()

&#x20;   )



&#x20;   if preset is not None:

&#x20;       x\_left = int(preset\["x\_left\_0deg"])

&#x20;       x\_right = int(preset\["x\_right\_360deg"])

&#x20;       y\_top = int(preset\["y\_top\_plot"])

&#x20;       y\_bottom = int(preset\["y\_bottom\_plot"])



&#x20;       calibration\_mode\_dropdown.value = "Manual calibration"

&#x20;       state\["calibration\_source"] = "saved\_calibration\_preset\_auto\_loaded"

&#x20;       state\["calibration\_preset\_loaded"] = True



&#x20;   elif state\["default\_size\_match"]:

&#x20;       x\_left = DEFAULT\_X\_LEFT

&#x20;       x\_right = DEFAULT\_X\_RIGHT

&#x20;       y\_top = DEFAULT\_Y\_TOP

&#x20;       y\_bottom = DEFAULT\_Y\_BOTTOM



&#x20;       calibration\_mode\_dropdown.value = "Use default PDProcessingII calibration"

&#x20;       state\["calibration\_source"] = "default\_PDProcessingII"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   else:

&#x20;       x\_left = int(auto\_x\_left)

&#x20;       x\_right = int(auto\_x\_right)

&#x20;       y\_top = int(auto\_y\_top)

&#x20;       y\_bottom = int(auto\_y\_bottom)



&#x20;       calibration\_mode\_dropdown.value = "Use auto-detected calibration"

&#x20;       state\["calibration\_source"] = "auto\_detected\_plot\_frame"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   x\_left\_slider.value = int(x\_left)

&#x20;   x\_right\_slider.value = int(x\_right)

&#x20;   y\_top\_slider.value = int(y\_top)

&#x20;   y\_bottom\_slider.value = int(y\_bottom)



&#x20;   left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;   right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))



&#x20;   update\_calibration\_preset\_status()





def apply\_calibration\_mode(change=None):

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   mode = calibration\_mode\_dropdown.value



&#x20;   if mode == "Use default PDProcessingII calibration":

&#x20;       if not state\["default\_size\_match"]:

&#x20;           calibration\_mode\_dropdown.value = "Use auto-detected calibration"

&#x20;           return



&#x20;       x\_left\_slider.value = DEFAULT\_X\_LEFT

&#x20;       x\_right\_slider.value = DEFAULT\_X\_RIGHT

&#x20;       y\_top\_slider.value = DEFAULT\_Y\_TOP

&#x20;       y\_bottom\_slider.value = DEFAULT\_Y\_BOTTOM



&#x20;       state\["calibration\_source"] = "default\_PDProcessingII"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   elif mode == "Use auto-detected calibration":

&#x20;       x\_left\_slider.value = int(state\["auto\_x\_left"])

&#x20;       x\_right\_slider.value = int(state\["auto\_x\_right"])

&#x20;       y\_top\_slider.value = int(state\["auto\_y\_top"])

&#x20;       y\_bottom\_slider.value = int(state\["auto\_y\_bottom"])



&#x20;       state\["calibration\_source"] = "auto\_detected\_plot\_frame"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;   elif mode == "Manual calibration":

&#x20;       state\["calibration\_source"] = state.get("calibration\_source", "manual\_calibration")



&#x20;   update\_calibration\_preset\_status()

&#x20;   draw\_all()



calibration\_mode\_dropdown.observe(apply\_calibration\_mode, names="value")





def redetect\_gap\_lines():

&#x20;   """

&#x20;   Detect suggested gap lines.



&#x20;   V5 policy:

&#x20;   - Auto detection may warn that the pattern looks single-sided / unclear.

&#x20;   - The workflow does NOT force the case to Not measurable anymore.

&#x20;   - Gap-time lines remain visible and adjustable.

&#x20;   - Only when the user clicks Not Measurable will the saved result become Not measurable.

&#x20;   """

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   if x\_right <= x\_left or y\_bottom <= y\_top:

&#x20;       state\["auto\_result"] = None

&#x20;       state\["auto\_detection\_status"] = "invalid\_calibration"

&#x20;       state\["gap\_not\_measurable\_recommended"] = False

&#x20;       state\["gap\_not\_measurable\_status"] = "invalid\_calibration"

&#x20;       state\["gap\_not\_measurable\_reason"] = make\_not\_measurable\_reason\_text("invalid\_calibration")

&#x20;       draw\_all()

&#x20;       return



&#x20;   auto\_result, auto\_status = auto\_detect\_gap\_lines(

&#x20;       state\["prpd\_rgb"],

&#x20;       x\_left,

&#x20;       x\_right,

&#x20;       y\_top,

&#x20;       y\_bottom

&#x20;   )



&#x20;   state\["auto\_result"] = auto\_result

&#x20;   state\["auto\_detection\_status"] = auto\_status



&#x20;   if is\_not\_measurable\_auto\_status(auto\_status):

&#x20;       # Keep the reason as an AUTO WARNING only.

&#x20;       # Do not force not-measurable and do not hide the gap-time lines.

&#x20;       state\["gap\_not\_measurable\_recommended"] = False

&#x20;       state\["gap\_not\_measurable\_status"] = auto\_status

&#x20;       state\["gap\_not\_measurable\_reason"] = make\_not\_measurable\_reason\_text(auto\_status)



&#x20;       # Keep default / current measurable lines so the user can still measure if appropriate.

&#x20;       # If sliders are not initialized properly, place a reasonable default gap.

&#x20;       try:

&#x20;           if left\_line\_slider.value <= x\_left or left\_line\_slider.value >= x\_right:

&#x20;               left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;           if right\_line\_slider.value <= x\_left or right\_line\_slider.value >= x\_right:

&#x20;               right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))

&#x20;           if right\_line\_slider.value <= left\_line\_slider.value:

&#x20;               left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;               right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))

&#x20;       except Exception:

&#x20;           left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;           right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))



&#x20;   else:

&#x20;       state\["gap\_not\_measurable\_recommended"] = False

&#x20;       state\["gap\_not\_measurable\_status"] = ""

&#x20;       state\["gap\_not\_measurable\_reason"] = ""



&#x20;       if auto\_result is None:

&#x20;           left\_line\_slider.value = int(phase\_deg\_to\_pixel(150, x\_left, x\_right))

&#x20;           right\_line\_slider.value = int(phase\_deg\_to\_pixel(180, x\_left, x\_right))

&#x20;       else:

&#x20;           left\_line\_slider.value = int(auto\_result\["left\_line\_x"])

&#x20;           right\_line\_slider.value = int(auto\_result\["right\_line\_x"])



&#x20;   draw\_all()



\# =========================================================

\# CALIBRATION BUTTON EVENTS

\# =========================================================



def on\_save\_calibration\_preset\_clicked(b):

&#x20;   with calibration\_preset\_output:

&#x20;       clear\_output(wait=True)



&#x20;       if state.get("prpd\_rgb", None) is None:

&#x20;           print("ERROR: ยังไม่ได้โหลด PRPD image")

&#x20;           return



&#x20;       w, h = get\_current\_image\_size\_for\_preset()



&#x20;       if x\_right\_slider.value <= x\_left\_slider.value:

&#x20;           print("ERROR: x\_right\_360deg ต้องมากกว่า x\_left\_0deg")

&#x20;           return



&#x20;       if y\_bottom\_slider.value <= y\_top\_slider.value:

&#x20;           print("ERROR: y\_bottom ต้องมากกว่า y\_top")

&#x20;           return



&#x20;       preset\_name = make\_default\_preset\_name()



&#x20;       saved\_row = save\_calibration\_preset\_to\_csv(

&#x20;           preset\_name=preset\_name,

&#x20;           image\_width=w,

&#x20;           image\_height=h,

&#x20;           x\_left\_0deg=x\_left\_slider.value,

&#x20;           x\_right\_360deg=x\_right\_slider.value,

&#x20;           y\_top\_plot=y\_top\_slider.value,

&#x20;           y\_bottom\_plot=y\_bottom\_slider.value,

&#x20;           remark="saved\_from\_auto\_workflow"

&#x20;       )



&#x20;       state\["calibration\_source"] = "saved\_calibration\_preset"

&#x20;       state\["calibration\_preset\_loaded"] = True



&#x20;       print("=" \* 100)

&#x20;       print("CALIBRATION PRESET SAVED")

&#x20;       print("=" \* 100)

&#x20;       print("Preset name :", saved\_row\["preset\_name"])

&#x20;       print("Image size  :", f"{saved\_row\['image\_width']} x {saved\_row\['image\_height']}")

&#x20;       print("0 deg       :", saved\_row\["x\_left\_0deg"])

&#x20;       print("360 deg     :", saved\_row\["x\_right\_360deg"])

&#x20;       print("Y top       :", saved\_row\["y\_top\_plot"])

&#x20;       print("Y bottom    :", saved\_row\["y\_bottom\_plot"])

&#x20;       print("Saved time  :", saved\_row\["saved\_time"])

&#x20;       print("CSV path    :", CALIBRATION\_PRESET\_CSV)



&#x20;       update\_calibration\_preset\_status()

&#x20;       redetect\_gap\_lines()





def on\_load\_calibration\_preset\_clicked(b):

&#x20;   with calibration\_preset\_output:

&#x20;       clear\_output(wait=True)



&#x20;       if state.get("prpd\_rgb", None) is None:

&#x20;           print("ERROR: ยังไม่ได้โหลด PRPD image")

&#x20;           return



&#x20;       w, h = get\_current\_image\_size\_for\_preset()

&#x20;       preset\_name = make\_default\_preset\_name()



&#x20;       preset = find\_matching\_calibration\_preset(

&#x20;           image\_width=w,

&#x20;           image\_height=h,

&#x20;           preset\_name=preset\_name

&#x20;       )



&#x20;       if preset is None:

&#x20;           print("=" \* 100)

&#x20;           print("NO CALIBRATION PRESET FOUND")

&#x20;           print("=" \* 100)

&#x20;           print("Image size:", f"{w} x {h}")

&#x20;           print("Preset name:", preset\_name)

&#x20;           print("ให้ปรับแกนเอง แล้วกด Save Calibration Preset ก่อน")

&#x20;           update\_calibration\_preset\_status()

&#x20;           return



&#x20;       apply\_calibration\_preset\_row(preset, redraw=False)



&#x20;       print("=" \* 100)

&#x20;       print("CALIBRATION PRESET LOADED")

&#x20;       print("=" \* 100)

&#x20;       print("Preset name :", preset\["preset\_name"])

&#x20;       print("Image size  :", f"{preset\['image\_width']} x {preset\['image\_height']}")

&#x20;       print("0 deg       :", int(preset\["x\_left\_0deg"]))

&#x20;       print("360 deg     :", int(preset\["x\_right\_360deg"]))

&#x20;       print("Y top       :", int(preset\["y\_top\_plot"]))

&#x20;       print("Y bottom    :", int(preset\["y\_bottom\_plot"]))

&#x20;       print("Saved time  :", preset\["saved\_time"])



&#x20;       update\_calibration\_preset\_status()

&#x20;       redetect\_gap\_lines()





def on\_clear\_calibration\_preset\_clicked(b):

&#x20;   with calibration\_preset\_output:

&#x20;       clear\_output(wait=True)



&#x20;       if not os.path.exists(CALIBRATION\_PRESET\_CSV):

&#x20;           print("No preset CSV found.")

&#x20;           update\_calibration\_preset\_status()

&#x20;           return



&#x20;       df = pd.read\_csv(CALIBRATION\_PRESET\_CSV)



&#x20;       if len(df) == 0:

&#x20;           print("Preset CSV is already empty.")

&#x20;           update\_calibration\_preset\_status()

&#x20;           return



&#x20;       w, h = get\_current\_image\_size\_for\_preset()



&#x20;       if w is None:

&#x20;           print("ERROR: ยังไม่ได้โหลด image จึงไม่รู้ image size")

&#x20;           return



&#x20;       preset\_name = make\_default\_preset\_name()



&#x20;       before = len(df)



&#x20;       df = df\[

&#x20;           \~(

&#x20;               (df\["preset\_name"].astype(str) == str(preset\_name)) \&

&#x20;               (df\["image\_width"].astype(int) == int(w)) \&

&#x20;               (df\["image\_height"].astype(int) == int(h))

&#x20;           )

&#x20;       ].copy()



&#x20;       after = len(df)



&#x20;       df.to\_csv(CALIBRATION\_PRESET\_CSV, index=False)



&#x20;       state\["calibration\_source"] = "preset\_cleared"

&#x20;       state\["calibration\_preset\_loaded"] = False



&#x20;       print("=" \* 100)

&#x20;       print("CALIBRATION PRESET CLEARED")

&#x20;       print("=" \* 100)

&#x20;       print("Removed rows:", before - after)

&#x20;       print("CSV path:", CALIBRATION\_PRESET\_CSV)



&#x20;       update\_calibration\_preset\_status()





save\_calibration\_preset\_button.on\_click(on\_save\_calibration\_preset\_clicked)

load\_calibration\_preset\_button.on\_click(on\_load\_calibration\_preset\_clicked)

clear\_calibration\_preset\_button.on\_click(on\_clear\_calibration\_preset\_clicked)



\# =========================================================

\# DRAW

\# =========================================================



def compute\_current\_result():

&#x20;   x\_left = x\_left\_slider.value

&#x20;   x\_right = x\_right\_slider.value

&#x20;   y\_top = y\_top\_slider.value

&#x20;   y\_bottom = y\_bottom\_slider.value



&#x20;   left\_x = left\_line\_slider.value

&#x20;   right\_x = right\_line\_slider.value



&#x20;   if x\_right <= x\_left or y\_bottom <= y\_top:

&#x20;       return None



&#x20;   # V5: even if Auto warns about single-sided / unclear clusters,

&#x20;   # keep calculating from the visible user-adjustable lines.

&#x20;   # Not measurable is applied only when the user clicks the Not Measurable button.

&#x20;   left\_phase = pixel\_to\_phase\_deg(left\_x, x\_left, x\_right)

&#x20;   right\_phase = pixel\_to\_phase\_deg(right\_x, x\_left, x\_right)



&#x20;   gap\_angle = right\_phase - left\_phase



&#x20;   if gap\_angle <= 0:

&#x20;       gap\_time\_ms = np.nan

&#x20;       gap\_band = "Invalid"

&#x20;       severity = "Invalid lines"

&#x20;       status = "invalid\_lines"

&#x20;   else:

&#x20;       gap\_time\_ms = gap\_angle\_to\_ms(gap\_angle)

&#x20;       gap\_band = gap\_time\_band(gap\_time\_ms)

&#x20;       severity = severity\_from\_gap\_time\_and\_source(

&#x20;           gap\_time\_ms,

&#x20;           pd\_source\_dropdown.value

&#x20;       )

&#x20;       status = "measurable"



&#x20;   return {

&#x20;       "x\_left": x\_left,

&#x20;       "x\_right": x\_right,

&#x20;       "y\_top": y\_top,

&#x20;       "y\_bottom": y\_bottom,

&#x20;       "left\_x": left\_x,

&#x20;       "right\_x": right\_x,

&#x20;       "left\_phase": left\_phase,

&#x20;       "right\_phase": right\_phase,

&#x20;       "gap\_angle": gap\_angle,

&#x20;       "gap\_time\_ms": gap\_time\_ms,

&#x20;       "gap\_band": gap\_band,

&#x20;       "severity": severity,

&#x20;       "gap\_measurement\_status": status,

&#x20;       "not\_measurable\_reason": ""

&#x20;   }



def draw\_all():

&#x20;   update\_ai\_locked\_panel()

&#x20;   update\_calibration\_preset\_status()



&#x20;   with plot\_output:

&#x20;       clear\_output(wait=True)



&#x20;       if state\["prpd\_rgb"] is None:

&#x20;           print("ยังไม่ได้โหลดเคส")

&#x20;           return



&#x20;       result = compute\_current\_result()



&#x20;       if result is None:

&#x20;           print("ERROR: Invalid axis calibration")

&#x20;           return



&#x20;       img\_rgb = state\["prpd\_rgb"]

&#x20;       ai\_result = state\["ai\_result"]



&#x20;       x\_left = result\["x\_left"]

&#x20;       x\_right = result\["x\_right"]

&#x20;       y\_top = result\["y\_top"]

&#x20;       y\_bottom = result\["y\_bottom"]

&#x20;       left\_x = result\["left\_x"]

&#x20;       right\_x = result\["right\_x"]



&#x20;       fig, ax = plt.subplots(figsize=(9.5, 5.2))

&#x20;       ax.imshow(img\_rgb)



&#x20;       rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;       rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;       ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Current plot frame")



&#x20;       ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.6, label="0 deg")

&#x20;       ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.6, label="360 deg")



&#x20;       ax.axvline(phase\_deg\_to\_pixel(90, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.1, label="90/180/270 deg")

&#x20;       ax.axvline(phase\_deg\_to\_pixel(180, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.1)

&#x20;       ax.axvline(phase\_deg\_to\_pixel(270, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.1)



&#x20;       if state\["auto\_result"] is not None:

&#x20;           pos\_l, pos\_r = state\["auto\_result"]\["positive\_x\_range\_pixel"]

&#x20;           neg\_l, neg\_r = state\["auto\_result"]\["negative\_x\_range\_pixel"]



&#x20;           ax.axvspan(pos\_l, pos\_r, color="yellow", alpha=0.12, label="positive cluster range")

&#x20;           ax.axvspan(neg\_l, neg\_r, color="cyan", alpha=0.12, label="negative cluster range")



&#x20;       # V5: always show gap-time lines unless the user saves using Not Measurable.

&#x20;       ax.axvline(left\_x, color="red", linewidth=2.6, label="Left gap line")

&#x20;       ax.axvline(right\_x, color="green", linewidth=2.6, label="Right gap line")



&#x20;       auto\_warning = state.get("gap\_not\_measurable\_reason", "")



&#x20;       title\_text = (

&#x20;           f"{state\['prpd\_filename']} | {ai\_result\['model\_used']}\\n"

&#x20;           f"{make\_ai\_display\_text(ai\_result)} | PD source: {pd\_source\_dropdown.value}\\n"

&#x20;           f"Gap angle = {result\['gap\_angle']:.2f} deg | "

&#x20;           f"Gap time = {result\['gap\_time\_ms']:.2f} ms | "

&#x20;           f"Band = {result\['gap\_band']} | Severity = {result\['severity']}"

&#x20;       )



&#x20;       if auto\_warning != "":

&#x20;           title\_text += f"\\nAuto note: {auto\_warning} — click Not Measurable only if confirmed"



&#x20;       ax.set\_title(title\_text, fontsize=9)

&#x20;       ax.axis("off")

&#x20;       ax.legend(loc="upper right", fontsize=8)

&#x20;       plt.tight\_layout()

&#x20;       plt.show()



&#x20;       print("=" \* 90)

&#x20;       print("CURRENT RESULT")

&#x20;       print("=" \* 90)

&#x20;       print("PRPD file        :", state\["prpd\_filename"])

&#x20;       print("TF file          :", state\["tf\_filename"])

&#x20;       print("AI display       :", make\_ai\_display\_text(ai\_result))

&#x20;       print("AI final result  :", ai\_result\["final\_result"], f"({ai\_result\['final\_score']:.2f}%)")

&#x20;       print("AI status        :", ai\_result\["status"])

&#x20;       print("PD rule class    :", ai\_result\["pd\_rule\_class"])

&#x20;       print("PD selection rule:", ai\_result\["pd\_selection\_rule"])

&#x20;       print("PD source        :", pd\_source\_dropdown.value)

&#x20;       print("-" \* 90)

&#x20;       print("Calibration source       :", state.get("calibration\_source", ""))

&#x20;       print("Calibration preset loaded:", state.get("calibration\_preset\_loaded", False))

&#x20;       print("x\_left 0deg      :", x\_left)

&#x20;       print("x\_right 360deg   :", x\_right)

&#x20;       print("y\_top            :", y\_top)

&#x20;       print("y\_bottom         :", y\_bottom)

&#x20;       print("-" \* 90)

&#x20;       print("Auto gap status  :", state\["auto\_detection\_status"])

&#x20;       print("Auto note        :", auto\_warning if auto\_warning else "")

&#x20;       print("Manual decision  : Use Accept and Save for measured Gap-time, or Not Measurable if the pattern is confirmed unmeasurable.")

&#x20;       print("-" \* 90)

&#x20;       print("Left line pixel  :", left\_x)

&#x20;       print("Right line pixel :", right\_x)

&#x20;       print("Left phase       :", f"{result\['left\_phase']:.2f} degree")

&#x20;       print("Right phase      :", f"{result\['right\_phase']:.2f} degree")

&#x20;       print("Gap angle        :", f"{result\['gap\_angle']:.2f} degree")

&#x20;       print("Gap time         :", f"{result\['gap\_time\_ms']:.2f} ms")

&#x20;       print("Gap band         :", result\["gap\_band"])

&#x20;       print("Severity         :", result\["severity"])



\# =========================================================

\# LOAD CASE

\# =========================================================



def load\_case\_by\_original\_index(original\_idx):

&#x20;   with loader\_output:

&#x20;       clear\_output(wait=True)



&#x20;       row = df\_map\_ok.loc\[int(original\_idx)]



&#x20;       prpd\_path = row\["output\_prpd\_path"]

&#x20;       tf\_path = row\["output\_tf\_path"]



&#x20;       if not os.path.exists(prpd\_path):

&#x20;           print("ERROR: PRPD file not found:", prpd\_path)

&#x20;           return False



&#x20;       if not os.path.exists(tf\_path):

&#x20;           print("ERROR: TF file not found:", tf\_path)

&#x20;           return False



&#x20;       prpd\_bytes = read\_image\_bytes(prpd\_path)

&#x20;       tf\_bytes = read\_image\_bytes(tf\_path)



&#x20;       state\["current\_map\_row"] = row



&#x20;       state\["prpd\_filename"] = row\["output\_prpd\_filename"]

&#x20;       state\["tf\_filename"] = row\["output\_tf\_filename"]



&#x20;       state\["prpd\_path"] = prpd\_path

&#x20;       state\["tf\_path"] = tf\_path



&#x20;       state\["prpd\_bytes"] = prpd\_bytes

&#x20;       state\["tf\_bytes"] = tf\_bytes



&#x20;       state\["prpd\_rgb"] = bytes\_to\_rgb\_image(prpd\_bytes)

&#x20;       state\["tf\_rgb"] = bytes\_to\_rgb\_image(tf\_bytes)



&#x20;       level\_state\["current\_original\_index"] = int(original\_idx)



&#x20;       print("=" \* 100)

&#x20;       print("DATASET CASE LOADED")

&#x20;       print("=" \* 100)

&#x20;       print("Defect ID     :", row\["defect\_id"])

&#x20;       print("Defect name   :", row\["defect\_name"])

&#x20;       print("Case folder   :", row\["case\_folder"])

&#x20;       print("Case base     :", row\["case\_base\_name"])

&#x20;       print("PRPD filename :", row\["output\_prpd\_filename"])

&#x20;       print("TF filename   :", row\["output\_tf\_filename"])

&#x20;       print("PRPD path     :", prpd\_path)

&#x20;       print("TF path       :", tf\_path)



&#x20;       print("\\nRunning Hybrid AI classification...")



&#x20;       ai\_result = run\_hybrid\_ai(

&#x20;           state\["prpd\_rgb"],

&#x20;           state\["tf\_rgb"]

&#x20;       )



&#x20;       state\["ai\_result"] = ai\_result



&#x20;       print("\\nAI RESULT")

&#x20;       print("-" \* 100)

&#x20;       print("Mode               :", ai\_result\["mode"])

&#x20;       print("Input mode         :", ai\_result\["input\_mode"])

&#x20;       print("Model used         :", ai\_result\["model\_used"])

&#x20;       print("Model path         :", ai\_result\["model\_path\_used"])

&#x20;       print("Top class          :", ai\_result\["top\_class"])

&#x20;       print("Top score          :", f"{ai\_result\['top\_score']:.2f}%")

&#x20;       print("Final result       :", ai\_result\["final\_result"])

&#x20;       print("Final score        :", f"{ai\_result\['final\_score']:.2f}%")

&#x20;       print("Status             :", ai\_result\["status"])

&#x20;       print("High conf count    :", ai\_result\["high\_conf\_count"])

&#x20;       print("PD rule class      :", ai\_result\["pd\_rule\_class"])

&#x20;       print("PD selection rule  :", ai\_result\["pd\_selection\_rule"])

&#x20;       print("Suggested PD source:", ai\_result\["suggested\_pd\_source"])



&#x20;       print\_ai\_percent\_bars(

&#x20;           ai\_result\["scores\_percent"],

&#x20;           ai\_result\["non\_identified\_percent"]

&#x20;       )



&#x20;       print("\\nไปปรับเส้นที่ MODEL 4 CONTROL PANEL ด้านล่างได้เลย")



&#x20;   setup\_sliders\_after\_image\_load()



&#x20;   pd\_source\_dropdown.value = state\["ai\_result"]\["suggested\_pd\_source"]



&#x20;   status\_html.value = (

&#x20;       f"<b>Loaded:</b> {state\['prpd\_filename']} + {state\['tf\_filename']}<br>"

&#x20;       f"<b>Defect:</b> \[{row\['defect\_id']}] {row\['defect\_name']} / {row\['case\_base\_name']}<br>"

&#x20;       f"<b>AI:</b> {make\_ai\_display\_text(state\['ai\_result'])} | "

&#x20;       f"<b>PD rule:</b> {state\['ai\_result']\['pd\_rule\_class']} / {state\['ai\_result']\['pd\_selection\_rule']}<br>"

&#x20;       f"<b>Calibration source:</b> {state.get('calibration\_source', '')}"

&#x20;   )



&#x20;   update\_ai\_locked\_panel()

&#x20;   redetect\_gap\_lines()

&#x20;   update\_progress\_html()



&#x20;   return True





def on\_load\_case\_clicked(b):

&#x20;   if case\_select.value is None:

&#x20;       with loader\_output:

&#x20;           clear\_output(wait=True)

&#x20;           print("ERROR: Please select a case first.")

&#x20;       return



&#x20;   update\_position\_from\_select()

&#x20;   load\_case\_by\_original\_index(case\_select.value)



load\_case\_button.on\_click(on\_load\_case\_clicked)





def load\_next\_case():

&#x20;   df\_use = level\_state\["current\_df"]



&#x20;   if df\_use is None or len(df\_use) == 0:

&#x20;       with loader\_output:

&#x20;           print("No case list available.")

&#x20;       return False



&#x20;   current\_pos = int(level\_state\["current\_position"])

&#x20;   next\_pos = current\_pos + 1



&#x20;   if next\_pos >= len(df\_use):

&#x20;       with loader\_output:

&#x20;           print("\\n" + "=" \* 100)

&#x20;           print("END OF CURRENT FILTER LIST")

&#x20;           print("=" \* 100)

&#x20;           print("No next case available.")

&#x20;       return False



&#x20;   next\_row = df\_use.iloc\[next\_pos]

&#x20;   next\_original\_idx = get\_original\_index\_from\_row(next\_row)



&#x20;   if next\_original\_idx is None:

&#x20;       with loader\_output:

&#x20;           print("ERROR: Cannot find next original index.")

&#x20;       return False



&#x20;   level\_state\["current\_position"] = next\_pos

&#x20;   level\_state\["current\_original\_index"] = next\_original\_idx



&#x20;   case\_select.value = next\_original\_idx



&#x20;   return load\_case\_by\_original\_index(next\_original\_idx)





def load\_first\_remaining\_case():

&#x20;   update\_case\_select()



&#x20;   if case\_select.value is None:

&#x20;       with loader\_output:

&#x20;           print("No remaining case to load.")

&#x20;       return False



&#x20;   return load\_case\_by\_original\_index(case\_select.value)





def on\_load\_next\_clicked(b):

&#x20;   load\_next\_case()



load\_next\_button.on\_click(on\_load\_next\_clicked)



\# =========================================================

\# SAVE RESULT

\# =========================================================



def build\_common\_row():

&#x20;   ai\_result = state\["ai\_result"]

&#x20;   map\_row = state\["current\_map\_row"]



&#x20;   return {

&#x20;       "record\_id": map\_row\["case\_base\_name"],

&#x20;       "defect\_id": map\_row\["defect\_id"],

&#x20;       "defect\_name": map\_row\["defect\_name"],

&#x20;       "case\_folder": map\_row\["case\_folder"],

&#x20;       "case\_base\_name": map\_row\["case\_base\_name"],



&#x20;       "prpd\_filename": state\["prpd\_filename"],

&#x20;       "tf\_filename": state\["tf\_filename"],



&#x20;       "source\_prpd\_path": state\["prpd\_path"],

&#x20;       "source\_tf\_path": state\["tf\_path"],



&#x20;       "ai\_mode": ai\_result\["mode"],

&#x20;       "ai\_input\_mode": ai\_result\["input\_mode"],

&#x20;       "ai\_model\_used": ai\_result\["model\_used"],

&#x20;       "ai\_model\_path": ai\_result\["model\_path\_used"],



&#x20;       "ai\_top\_class": ai\_result\["top\_class"],

&#x20;       "ai\_top\_score\_percent": round(ai\_result\["top\_score"], 6),



&#x20;       "ai\_final\_result": ai\_result\["final\_result"],

&#x20;       "ai\_final\_score\_percent": round(ai\_result\["final\_score"], 6),

&#x20;       "ai\_status": ai\_result\["status"],

&#x20;       "ai\_high\_conf\_count": ai\_result\["high\_conf\_count"],

&#x20;       "ai\_non\_identified\_percent": round(ai\_result\["non\_identified\_percent"], 6),

&#x20;       "ai\_decision\_rule": ai\_result.get("ai\_decision\_rule", "top\_class\_gt\_30\_else\_non\_identified"),

&#x20;       "ai\_threshold\_percent": ai\_result.get("ai\_threshold\_percent", TOPCLASS\_THRESHOLD),



&#x20;       "ai\_confidence\_corona": round(ai\_result\["confidence\_dict"].get("Corona", np.nan), 6),

&#x20;       "ai\_confidence\_surface": round(ai\_result\["confidence\_dict"].get("Surface", np.nan), 6),

&#x20;       "ai\_confidence\_internal": round(ai\_result\["confidence\_dict"].get("Internal", np.nan), 6),



&#x20;       "pd\_rule\_class": ai\_result\["pd\_rule\_class"],

&#x20;       "pd\_selection\_rule": ai\_result\["pd\_selection\_rule"],

&#x20;       "is\_strong\_pd\_rule": ai\_result.get("is\_strong\_pd\_rule", False),

&#x20;       "suggested\_pd\_source\_type": ai\_result\["suggested\_pd\_source"],

&#x20;       "confirmed\_pd\_source\_type": pd\_source\_dropdown.value,



&#x20;       "image\_width": state\["image\_width"],

&#x20;       "image\_height": state\["image\_height"],

&#x20;       "default\_size\_match": state\["default\_size\_match"],

&#x20;       "calibration\_mode": calibration\_mode\_dropdown.value,

&#x20;       "auto\_calibration\_status": state\["auto\_calibration\_status"],

&#x20;       "calibration\_source": state.get("calibration\_source", ""),

&#x20;       "calibration\_preset\_loaded": state.get("calibration\_preset\_loaded", False),

&#x20;       "calibration\_preset\_path": state.get("calibration\_preset\_path", CALIBRATION\_PRESET\_CSV),



&#x20;       "x\_left\_0deg": x\_left\_slider.value,

&#x20;       "x\_right\_360deg": x\_right\_slider.value,

&#x20;       "y\_top\_plot": y\_top\_slider.value,

&#x20;       "y\_bottom\_plot": y\_bottom\_slider.value,

&#x20;       "auto\_gap\_status": state\["auto\_detection\_status"],

&#x20;       "auto\_not\_measurable\_recommended": state.get("gap\_not\_measurable\_recommended", False),

&#x20;       "auto\_not\_measurable\_status": state.get("gap\_not\_measurable\_status", ""),

&#x20;       "auto\_not\_measurable\_reason": state.get("gap\_not\_measurable\_reason", ""),



&#x20;       "review\_status": review\_status\_dropdown.value,

&#x20;       "reviewer\_name": reviewer\_name\_text.value.strip() if reviewer\_name\_text.value.strip() != "" else "unknown\_reviewer",

&#x20;       "reviewer\_role": reviewer\_role\_dropdown.value,

&#x20;       "review\_note": review\_note\_text.value,



&#x20;       "created\_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

&#x20;       "updated\_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

&#x20;   }





def save\_annotated\_image(output\_path, row, not\_measurable=False):

&#x20;   img\_rgb = state\["prpd\_rgb"]



&#x20;   x\_left = row\["x\_left\_0deg"]

&#x20;   x\_right = row\["x\_right\_360deg"]

&#x20;   y\_top = row\["y\_top\_plot"]

&#x20;   y\_bottom = row\["y\_bottom\_plot"]



&#x20;   fig, ax = plt.subplots(figsize=(11, 6))

&#x20;   ax.imshow(img\_rgb)



&#x20;   rect\_x = \[x\_left, x\_right, x\_right, x\_left, x\_left]

&#x20;   rect\_y = \[y\_top, y\_top, y\_bottom, y\_bottom, y\_top]

&#x20;   ax.plot(rect\_x, rect\_y, color="orange", linewidth=2.0, label="Current plot frame")



&#x20;   ax.axvline(x\_left, color="blue", linestyle="--", linewidth=1.8, label="0 deg")

&#x20;   ax.axvline(x\_right, color="blue", linestyle="--", linewidth=1.8, label="360 deg")



&#x20;   ax.axvline(phase\_deg\_to\_pixel(90, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.2, label="90/180/270 deg")

&#x20;   ax.axvline(phase\_deg\_to\_pixel(180, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.2)

&#x20;   ax.axvline(phase\_deg\_to\_pixel(270, x\_left, x\_right), color="gray", linestyle=":", linewidth=1.2)



&#x20;   if row\["ai\_final\_result"] == "Non-identified":

&#x20;       ai\_title\_text = "AI result: Non-identified"

&#x20;   else:

&#x20;       ai\_title\_text = f"AI top class: {row\['ai\_final\_result']} ({row\['ai\_final\_score\_percent']:.2f}%)"



&#x20;   if not\_measurable:

&#x20;       reason = row.get("not\_measurable\_reason", "") or row.get("auto\_not\_measurable\_reason", "")

&#x20;       ax.set\_title(

&#x20;           f"{state\['prpd\_filename']}\\n"

&#x20;           f"{ai\_title\_text} | PD source: {row\['confirmed\_pd\_source\_type']}\\n"

&#x20;           f"Gap-time: Not measurable | Reason: {reason}"

&#x20;       )

&#x20;   else:

&#x20;       ax.axvline(row\["left\_line\_pixel"], color="red", linewidth=2.5, label="Left gap line")

&#x20;       ax.axvline(row\["right\_line\_pixel"], color="green", linewidth=2.5, label="Right gap line")



&#x20;       ax.set\_title(

&#x20;           f"{state\['prpd\_filename']}\\n"

&#x20;           f"{ai\_title\_text} | "

&#x20;           f"PD source: {row\['confirmed\_pd\_source\_type']}\\n"

&#x20;           f"Gap angle = {row\['gap\_angle\_deg']:.2f} deg | "

&#x20;           f"Gap time = {row\['gap\_time\_ms']:.2f} ms | "

&#x20;           f"Band = {row.get('gap\_time\_band', '')} | Severity = {row\['severity\_by\_gap\_time']}"

&#x20;       )



&#x20;   ax.axis("off")

&#x20;   ax.legend(loc="upper right")



&#x20;   os.makedirs(os.path.dirname(output\_path), exist\_ok=True)

&#x20;   plt.savefig(output\_path, dpi=300, bbox\_inches="tight")

&#x20;   plt.close(fig)



def save\_final\_result(row, not\_measurable=False):

&#x20;   prpd\_safe\_name = safe\_name\_from\_filename(state\["prpd\_filename"])

&#x20;   result\_folder = os.path.join(BASE\_RESULT\_DIR, prpd\_safe\_name)

&#x20;   os.makedirs(result\_folder, exist\_ok=True)



&#x20;   prpd\_ext = os.path.splitext(state\["prpd\_filename"])\[1].lower()

&#x20;   tf\_ext = os.path.splitext(state\["tf\_filename"])\[1].lower()



&#x20;   if prpd\_ext == "":

&#x20;       prpd\_ext = ".jpg"

&#x20;   if tf\_ext == "":

&#x20;       tf\_ext = ".jpg"



&#x20;   prpd\_original\_path = os.path.join(result\_folder, f"{prpd\_safe\_name}\_original\_PRPD{prpd\_ext}")

&#x20;   tf\_original\_path = os.path.join(result\_folder, f"{prpd\_safe\_name}\_original\_TF{tf\_ext}")



&#x20;   save\_bytes\_to\_file(state\["prpd\_bytes"], prpd\_original\_path)

&#x20;   save\_bytes\_to\_file(state\["tf\_bytes"], tf\_original\_path)



&#x20;   annotated\_path = os.path.join(result\_folder, f"{prpd\_safe\_name}\_annotated\_gap\_time.png")

&#x20;   per\_image\_csv\_path = os.path.join(result\_folder, f"{prpd\_safe\_name}\_final\_result.csv")



&#x20;   row\["result\_folder"] = result\_folder

&#x20;   row\["original\_prpd\_path"] = prpd\_original\_path

&#x20;   row\["original\_tf\_path"] = tf\_original\_path

&#x20;   row\["annotated\_image\_path"] = annotated\_path

&#x20;   row\["per\_image\_csv\_path"] = per\_image\_csv\_path



&#x20;   save\_annotated\_image(

&#x20;       annotated\_path,

&#x20;       row,

&#x20;       not\_measurable=not\_measurable

&#x20;   )



&#x20;   pd.DataFrame(\[row]).to\_csv(per\_image\_csv\_path, index=False)



&#x20;   df\_new = pd.DataFrame(\[row])



&#x20;   if os.path.exists(SUMMARY\_CSV):

&#x20;       df\_old = pd.read\_csv(SUMMARY\_CSV)



&#x20;       if "case\_base\_name" in df\_old.columns:

&#x20;           df\_old = df\_old\[df\_old\["case\_base\_name"] != row\["case\_base\_name"]]



&#x20;       df\_all = pd.concat(\[df\_old, df\_new], ignore\_index=True)

&#x20;   else:

&#x20;       df\_all = df\_new



&#x20;   df\_all.to\_csv(SUMMARY\_CSV, index=False)



&#x20;   # Append edit history for traceability

&#x20;   df\_hist\_new = pd.DataFrame(\[row])

&#x20;   if os.path.exists(EDIT\_HISTORY\_CSV):

&#x20;       df\_hist\_old = pd.read\_csv(EDIT\_HISTORY\_CSV)

&#x20;       df\_hist\_all = pd.concat(\[df\_hist\_old, df\_hist\_new], ignore\_index=True)

&#x20;   else:

&#x20;       df\_hist\_all = df\_hist\_new

&#x20;   df\_hist\_all.to\_csv(EDIT\_HISTORY\_CSV, index=False)



&#x20;   # Save Excel review output with embedded annotated image

&#x20;   append\_result\_to\_excel(row, MASTER\_EXCEL\_PATH)

&#x20;   reviewer\_excel\_path = append\_result\_to\_reviewer\_excel(row)



&#x20;   with plot\_output:

&#x20;       print("\\n" + "=" \* 90)

&#x20;       print("FINAL RESULT SAVED")

&#x20;       print("=" \* 90)

&#x20;       print("Saved folder:", result\_folder)

&#x20;       print("Original PRPD:", prpd\_original\_path)

&#x20;       print("Original TF:", tf\_original\_path)

&#x20;       print("Annotated image:", annotated\_path)

&#x20;       print("Per-image CSV:", per\_image\_csv\_path)

&#x20;       print("Summary CSV:", SUMMARY\_CSV)

&#x20;       print("Edit history CSV:", EDIT\_HISTORY\_CSV)

&#x20;       print("Master Excel:", MASTER\_EXCEL\_PATH)

&#x20;       print("Reviewer Excel:", reviewer\_excel\_path)





def remove\_completed\_case\_from\_current\_list(case\_base\_name):

&#x20;   global df\_map\_ok



&#x20;   df\_map\_ok = df\_map\_ok\[

&#x20;       df\_map\_ok\["case\_base\_name"].astype(str) != str(case\_base\_name)

&#x20;   ].copy().reset\_index(drop=True)



&#x20;   update\_case\_select()





def accept\_current\_result(b=None):

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   # V5: Accept and Save always saves the current measured gap-time from visible lines.

&#x20;   # Use the Not Measurable button only when the user/expert confirms the case is unmeasurable.



&#x20;   row = build\_common\_row()

&#x20;   result = compute\_current\_result()



&#x20;   if result is None:

&#x20;       with plot\_output:

&#x20;           print("ERROR: Invalid calibration. Cannot save.")

&#x20;       return



&#x20;   gap\_angle = result\["gap\_angle"]



&#x20;   if gap\_angle <= 0:

&#x20;       gap\_time\_ms = np.nan

&#x20;       gap\_band = "Invalid"

&#x20;       severity = "Invalid"

&#x20;       measurement\_status = "invalid\_lines"

&#x20;   else:

&#x20;       gap\_time\_ms = result\["gap\_time\_ms"]

&#x20;       gap\_band = result\["gap\_band"]

&#x20;       severity = result\["severity"]



&#x20;       auto\_result = state\["auto\_result"]



&#x20;       if auto\_result is not None:

&#x20;           auto\_left = auto\_result\["left\_line\_x"]

&#x20;           auto\_right = auto\_result\["right\_line\_x"]



&#x20;           if abs(result\["left\_x"] - auto\_left) > 2 or abs(result\["right\_x"] - auto\_right) > 2:

&#x20;               measurement\_status = "manually\_adjusted"

&#x20;           else:

&#x20;               measurement\_status = "auto\_accepted"

&#x20;       else:

&#x20;           measurement\_status = "manual\_or\_fallback"



&#x20;   row.update({

&#x20;       "left\_line\_pixel": result\["left\_x"],

&#x20;       "right\_line\_pixel": result\["right\_x"],

&#x20;       "left\_phase\_deg": round(result\["left\_phase"], 4),

&#x20;       "right\_phase\_deg": round(result\["right\_phase"], 4),

&#x20;       "gap\_angle\_deg": round(gap\_angle, 4),

&#x20;       "gap\_time\_ms": round(gap\_time\_ms, 4) if not np.isnan(gap\_time\_ms) else np.nan,

&#x20;       "gap\_time\_band": gap\_band,

&#x20;       "severity\_by\_gap\_time": severity,

&#x20;       "gap\_measurement\_status": measurement\_status,

&#x20;       "not\_measurable\_reason": "",

&#x20;       "remark": state.get("gap\_not\_measurable\_reason", "")

&#x20;   })



&#x20;   if state\["auto\_result"] is not None:

&#x20;       row\["detected\_case"] = state\["auto\_result"]\["detected\_case"]

&#x20;       row\["positive\_x\_range\_pixel"] = str(state\["auto\_result"]\["positive\_x\_range\_pixel"])

&#x20;       row\["negative\_x\_range\_pixel"] = str(state\["auto\_result"]\["negative\_x\_range\_pixel"])

&#x20;       row\["positive\_x\_range\_phase"] = str(state\["auto\_result"]\["positive\_x\_range\_phase"])

&#x20;       row\["negative\_x\_range\_phase"] = str(state\["auto\_result"]\["negative\_x\_range\_phase"])

&#x20;   else:

&#x20;       row\["detected\_case"] = ""

&#x20;       row\["positive\_x\_range\_pixel"] = ""

&#x20;       row\["negative\_x\_range\_pixel"] = ""

&#x20;       row\["positive\_x\_range\_phase"] = ""

&#x20;       row\["negative\_x\_range\_phase"] = ""



&#x20;   save\_final\_result(row, not\_measurable=False)



&#x20;   if level\_state\["auto\_next\_enabled"]:

&#x20;       remove\_completed\_case\_from\_current\_list(row\["case\_base\_name"])

&#x20;       load\_first\_remaining\_case()





def not\_measurable\_current\_result(b=None):

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   row = build\_common\_row()



&#x20;   reason = state.get("gap\_not\_measurable\_reason", "")

&#x20;   if reason == "":

&#x20;       reason = "user selected Not measurable"



&#x20;   status = state.get("gap\_not\_measurable\_status", "")

&#x20;   if status == "":

&#x20;       status = state.get("auto\_detection\_status", "")



&#x20;   row.update({

&#x20;       "left\_line\_pixel": np.nan,

&#x20;       "right\_line\_pixel": np.nan,

&#x20;       "left\_phase\_deg": np.nan,

&#x20;       "right\_phase\_deg": np.nan,

&#x20;       "gap\_angle\_deg": np.nan,

&#x20;       "gap\_time\_ms": np.nan,

&#x20;       "gap\_time\_band": "Not measurable",

&#x20;       "severity\_by\_gap\_time": "Not measurable",

&#x20;       "gap\_measurement\_status": "not\_measurable",

&#x20;       "not\_measurable\_reason": reason,

&#x20;       "detected\_case": status,

&#x20;       "positive\_x\_range\_pixel": "",

&#x20;       "negative\_x\_range\_pixel": "",

&#x20;       "positive\_x\_range\_phase": "",

&#x20;       "negative\_x\_range\_phase": "",

&#x20;       "remark": reason

&#x20;   })



&#x20;   save\_final\_result(row, not\_measurable=True)



&#x20;   if level\_state\["auto\_next\_enabled"]:

&#x20;       remove\_completed\_case\_from\_current\_list(row\["case\_base\_name"])

&#x20;       load\_first\_remaining\_case()



\# =========================================================

\# BUTTON ACTIONS

\# =========================================================



def move\_value(slider, delta):

&#x20;   if state\["prpd\_rgb"] is None:

&#x20;       return



&#x20;   slider.value = max(slider.min, min(slider.max, slider.value + delta))

&#x20;   state\["calibration\_source"] = "manual\_axis\_adjusted"

&#x20;   draw\_all()





btn\_x\_left\_minus.on\_click(lambda b: move\_value(x\_left\_slider, -1))

btn\_x\_left\_plus.on\_click(lambda b: move\_value(x\_left\_slider, +1))

btn\_x\_right\_minus.on\_click(lambda b: move\_value(x\_right\_slider, -1))

btn\_x\_right\_plus.on\_click(lambda b: move\_value(x\_right\_slider, +1))



btn\_y\_top\_minus.on\_click(lambda b: move\_value(y\_top\_slider, -1))

btn\_y\_top\_plus.on\_click(lambda b: move\_value(y\_top\_slider, +1))

btn\_y\_bottom\_minus.on\_click(lambda b: move\_value(y\_bottom\_slider, -1))

btn\_y\_bottom\_plus.on\_click(lambda b: move\_value(y\_bottom\_slider, +1))



btn\_left\_minus.on\_click(lambda b: move\_value(left\_line\_slider, -1))

btn\_left\_plus.on\_click(lambda b: move\_value(left\_line\_slider, +1))

btn\_right\_minus.on\_click(lambda b: move\_value(right\_line\_slider, -1))

btn\_right\_plus.on\_click(lambda b: move\_value(right\_line\_slider, +1))



btn\_redetect.on\_click(lambda b: redetect\_gap\_lines())

btn\_accept.on\_click(accept\_current\_result)

btn\_not\_measurable.on\_click(not\_measurable\_current\_result)



pd\_source\_dropdown.observe(lambda change: draw\_all(), names="value")



def on\_any\_slider\_change(change=None):

&#x20;   if state.get("prpd\_rgb", None) is not None:

&#x20;       draw\_all()



for s in \[

&#x20;   x\_left\_slider,

&#x20;   x\_right\_slider,

&#x20;   y\_top\_slider,

&#x20;   y\_bottom\_slider,

&#x20;   left\_line\_slider,

&#x20;   right\_line\_slider

]:

&#x20;   s.observe(on\_any\_slider\_change, names="value")



\# =========================================================

\# DISPLAY UI

\# =========================================================



if RESUME\_MODE:

&#x20;   resume\_status\_html.value = (

&#x20;       f"<b>Resume Mode:</b> ON<br>"

&#x20;       f"<b>Completed cases:</b> {len(completed\_cases)}<br>"

&#x20;       f"<b>Remaining cases:</b> {len(df\_map\_ok)}"

&#x20;   )

else:

&#x20;   resume\_status\_html.value = "<b>Resume Mode:</b> OFF"



dataset\_loader\_ui = widgets.VBox(\[

&#x20;   widgets.HTML("<hr><h2>MODEL 4 AUTO WORKFLOW: Dataset → Hybrid AI → Gap-Time → Save → Auto Next + Calibration Preset</h2>"),



&#x20;   widgets.HTML("<h3>1) Dataset Case Loader</h3>"),

&#x20;   resume\_status\_html,

&#x20;   defect\_filter\_dropdown,

&#x20;   case\_select,

&#x20;   case\_progress\_html,

&#x20;   widgets.HBox(\[load\_case\_button, load\_next\_button]),

&#x20;   auto\_next\_checkbox,

&#x20;   loader\_output,



&#x20;   widgets.HTML("<hr><h2>2) LOCKED AI RESULT PANEL</h2>"),

&#x20;   ai\_locked\_panel,



&#x20;   widgets.HTML("<hr><h2>3) Reviewer / Expert Confirmation</h2>"),

&#x20;   reviewer\_name\_text,

&#x20;   widgets.HBox(\[review\_status\_dropdown, reviewer\_role\_dropdown]),

&#x20;   review\_note\_text,

&#x20;   widgets.HBox(\[save\_reviewer\_button]),

&#x20;   reviewer\_output,



&#x20;   widgets.HTML("<hr><h2>4) Gap-time Control Panel</h2>"),

&#x20;   status\_html,



&#x20;   widgets.HTML("<h3>4.1 Axis / Plot Frame Calibration</h3>"),

&#x20;   calibration\_mode\_dropdown,

&#x20;   widgets.HBox(\[

&#x20;       widgets.VBox(\[

&#x20;           x\_left\_slider,

&#x20;           widgets.HBox(\[btn\_x\_left\_minus, btn\_x\_left\_plus]),

&#x20;       ]),

&#x20;       widgets.VBox(\[

&#x20;           x\_right\_slider,

&#x20;           widgets.HBox(\[btn\_x\_right\_minus, btn\_x\_right\_plus]),

&#x20;       ]),

&#x20;   ]),

&#x20;   widgets.HBox(\[

&#x20;       widgets.VBox(\[

&#x20;           y\_top\_slider,

&#x20;           widgets.HBox(\[btn\_y\_top\_minus, btn\_y\_top\_plus]),

&#x20;       ]),

&#x20;       widgets.VBox(\[

&#x20;           y\_bottom\_slider,

&#x20;           widgets.HBox(\[btn\_y\_bottom\_minus, btn\_y\_bottom\_plus]),

&#x20;       ]),

&#x20;   ]),

&#x20;   widgets.HBox(\[btn\_redetect]),



&#x20;   widgets.HTML("<hr><h2>5) Calibration Preset Memory</h2>"),

&#x20;   widgets.HTML("ปรับแกนให้ถูกก่อน แล้วกด Save Calibration Preset จากนั้น case ถัดไปจะใช้แกนนี้อัตโนมัติ"),

&#x20;   calibration\_preset\_status\_html,

&#x20;   widgets.HBox(\[

&#x20;       save\_calibration\_preset\_button,

&#x20;       load\_calibration\_preset\_button,

&#x20;       clear\_calibration\_preset\_button

&#x20;   ]),

&#x20;   calibration\_preset\_output,



&#x20;   widgets.HTML("<hr><h2>6) Current Plot / Result</h2>"),

&#x20;   plot\_output,



&#x20;   widgets.HTML("<h3>4.2 Adjust Final Gap-time Lines</h3>"),

&#x20;   widgets.HBox(\[

&#x20;       widgets.VBox(\[

&#x20;           left\_line\_slider,

&#x20;           widgets.HBox(\[btn\_left\_minus, btn\_left\_plus]),

&#x20;       ]),

&#x20;       widgets.VBox(\[

&#x20;           right\_line\_slider,

&#x20;           widgets.HBox(\[btn\_right\_minus, btn\_right\_plus]),

&#x20;       ]),

&#x20;   ]),



&#x20;   widgets.HTML("<h3>4.3 Confirm PD Source</h3>"),

&#x20;   pd\_source\_dropdown,



&#x20;   widgets.HTML("<hr><h2>7) Save Result</h2>"),

&#x20;   widgets.HTML("<b>Note:</b> Accept and Save keeps the measured Gap-time from the visible red/green lines. Click <b>Not Measurable</b> only when the user/expert confirms the case cannot be measured; the reason will be saved in CSV/Excel."),

&#x20;   widgets.HBox(\[btn\_accept, btn\_not\_measurable]),

])

display(dataset\_loader\_ui)



\# Initial list

update\_case\_select()

update\_calibration\_preset\_status()



print("=" \* 100)

print("AUTO WORKFLOW V5 LOADED")

print("=" \* 100)

print("ใช้ก้อนนี้แทน Auto เดิมได้เลย")

print("New result root:", NEW\_RESULT\_ROOT)

print("Summary CSV:", SUMMARY\_CSV)

print("Edit history CSV:", EDIT\_HISTORY\_CSV)

print("Master Excel:", MASTER\_EXCEL\_PATH)

print("Reviewer config CSV:", REVIEWER\_CONFIG\_CSV)

print("Calibration preset CSV:", CALIBRATION\_PRESET\_CSV)

print("AI rule:")

print(f"- If Corona/Surface/Internal are all <= {TOPCLASS\_THRESHOLD:.0f}% => Non-identified")

print(f"- If any class > {TOPCLASS\_THRESHOLD:.0f}% => use top class and confidence")

