**PART 0 Dataset CHECK**

\# ==========================================

\# CHECK PRPD ONLY DATASET

\# ==========================================



from google.colab import drive

drive.mount('/content/drive')



import os



\# ==========================================

\# 1. SHOW FOLDER IN MYDRIVE

\# ==========================================

print("\\n📂 Folders in MyDrive:\\n")



mydrive\_path = '/content/drive/MyDrive'



folders = os.listdir(mydrive\_path)



for f in folders:

&#x20;   print(f)



\# ==========================================

\# 2. DATASET PATH

\# ==========================================

BASE\_PATH = '/content/drive/MyDrive/PRPD\_Only\_dataset'



CLASS\_NAMES = \[

&#x20;   'Corona',

&#x20;   'Surface',

&#x20;   'Internal'

]



\# ==========================================

\# 3. CHECK BASE PATH

\# ==========================================

print("\\n" + "="\*60)

print("🔍 CHECK BASE PATH")

print("="\*60)



if not os.path.exists(BASE\_PATH):



&#x20;   print(f"\\n❌ DATASET NOT FOUND:\\n{BASE\_PATH}")



&#x20;   print("\\n⚠️ Check folder name in MyDrive")



else:



&#x20;   print(f"\\n✅ FOUND DATASET:\\n{BASE\_PATH}")



&#x20;   # ==========================================

&#x20;   # 4. CHECK DATASET

&#x20;   # ==========================================

&#x20;   total\_images = 0

&#x20;   wrong\_files = 0



&#x20;   for split in \['train', 'validation', 'test']:



&#x20;       print("\\n" + "="\*60)

&#x20;       print(f"📂 {split.upper()}")

&#x20;       print("="\*60)



&#x20;       split\_total = 0



&#x20;       for class\_name in CLASS\_NAMES:



&#x20;           class\_dir = os.path.join(

&#x20;               BASE\_PATH,

&#x20;               split,

&#x20;               class\_name

&#x20;           )



&#x20;           print(f"\\n🔍 Class : {class\_name}")



&#x20;           if not os.path.exists(class\_dir):



&#x20;               print(f"❌ Folder not found:\\n{class\_dir}")



&#x20;               continue



&#x20;           files = sorted(os.listdir(class\_dir))



&#x20;           # ----------------------------------

&#x20;           # IMAGE FILES

&#x20;           # ----------------------------------

&#x20;           image\_files = \[



&#x20;               f for f in files



&#x20;               if f.lower().endswith(

&#x20;                   (

&#x20;                       '.jpg',

&#x20;                       '.jpeg',

&#x20;                       '.png'

&#x20;                   )

&#x20;               )

&#x20;           ]



&#x20;           print(f"✅ Total images : {len(image\_files)}")



&#x20;           split\_total += len(image\_files)



&#x20;           # ----------------------------------

&#x20;           # CHECK PRPD NAME

&#x20;           # ----------------------------------

&#x20;           for file\_name in image\_files:



&#x20;               if 'PRPD' not in file\_name:



&#x20;                   wrong\_files += 1



&#x20;                   print("\\n❌ Wrong file name")

&#x20;                   print(file\_name)



&#x20;       total\_images += split\_total



&#x20;       print(f"\\n🔥 {split.upper()} TOTAL : {split\_total}")



&#x20;   # ==========================================

&#x20;   # 5. FINAL SUMMARY

&#x20;   # ==========================================

&#x20;   print("\\n" + "="\*60)

&#x20;   print("📊 FINAL SUMMARY")

&#x20;   print("="\*60)



&#x20;   print(f"✅ Total Images : {total\_images}")

&#x20;   print(f"❌ Wrong Files  : {wrong\_files}")



&#x20;   if total\_images == 0:



&#x20;       print("\\n❌ DATASET EMPTY")



&#x20;   elif wrong\_files == 0:



&#x20;       print("\\n🎉 Dataset is clean!")



&#x20;   else:



&#x20;       print("\\n⚠️ Found non-PRPD files")



**PART 1 Dataset Preparation**

\# ==========================================

\# PRPD\_2\_Only

\# PART 1 : DATASET PREPARATION

\# ==========================================



import os

import shutil

import numpy as np

import tensorflow as tf



\# ==========================================

\# 1. CONNECT GOOGLE DRIVE

\# ==========================================

from google.colab import drive

drive.mount('/content/drive')



\# ==========================================

\# 2. COPY DATASET TO LOCAL SSD

\# ==========================================

DRIVE\_PATH = '/content/drive/MyDrive/PRPD\_Only\_dataset'

LOCAL\_PATH = '/content/local\_prpd\_only'



if os.path.exists(LOCAL\_PATH):

&#x20;   shutil.rmtree(LOCAL\_PATH)



print("📦 Copy PRPD-only dataset to local SSD...")

shutil.copytree(DRIVE\_PATH, LOCAL\_PATH)



\# ==========================================

\# 3. CONFIG

\# ==========================================

IMG\_SIZE = 224

BATCH\_SIZE = 32



CLASS\_NAMES = \[

&#x20;   'Corona',

&#x20;   'Surface',

&#x20;   'Internal'

]



train\_dir = os.path.join(LOCAL\_PATH, 'train')

val\_dir   = os.path.join(LOCAL\_PATH, 'validation')

test\_dir  = os.path.join(LOCAL\_PATH, 'test')



\# ==========================================

\# 4. PREPROCESS IMAGE

\# ==========================================

def preprocess\_image(img\_path):



&#x20;   img = tf.io.read\_file(img\_path)



&#x20;   img = tf.image.decode\_image(

&#x20;       img,

&#x20;       channels=3,

&#x20;       expand\_animations=False

&#x20;   )



&#x20;   gray = tf.image.rgb\_to\_grayscale(img)

&#x20;   gray = tf.cast(gray, tf.float32)



&#x20;   # Contrast Stretching

&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (gray - pmin) / (pmax - pmin + 1e-5)



&#x20;   # Invert image

&#x20;   final = 1.0 - stretched



&#x20;   final = tf.image.grayscale\_to\_rgb(final)



&#x20;   final = tf.image.resize\_with\_pad(

&#x20;       final,

&#x20;       IMG\_SIZE,

&#x20;       IMG\_SIZE

&#x20;   )



&#x20;   return final



\# ==========================================

\# 5. LOAD PRPD DATASET

\# ==========================================

def load\_prpd\_dataset(base\_dir):



&#x20;   image\_paths = \[]

&#x20;   labels = \[]



&#x20;   for class\_idx, class\_name in enumerate(CLASS\_NAMES):



&#x20;       class\_dir = os.path.join(base\_dir, class\_name)



&#x20;       print(f"\\n📂 Loading: {class\_name}")



&#x20;       if not os.path.exists(class\_dir):

&#x20;           print(f"❌ Missing folder: {class\_dir}")

&#x20;           continue



&#x20;       files = sorted(os.listdir(class\_dir))



&#x20;       prpd\_files = \[

&#x20;           f for f in files

&#x20;           if f.lower().endswith(('.jpg', '.jpeg', '.png'))

&#x20;           and 'PRPD' in f

&#x20;       ]



&#x20;       print(f"✅ PRPD files: {len(prpd\_files)}")



&#x20;       for file\_name in prpd\_files:



&#x20;           image\_paths.append(

&#x20;               os.path.join(class\_dir, file\_name)

&#x20;           )



&#x20;           labels.append(class\_idx)



&#x20;   return image\_paths, labels



\# ==========================================

\# 6. LOAD TRAIN / VAL / TEST

\# ==========================================

train\_paths, train\_labels = load\_prpd\_dataset(train\_dir)

val\_paths, val\_labels     = load\_prpd\_dataset(val\_dir)

test\_paths, test\_labels   = load\_prpd\_dataset(test\_dir)



print("\\n================================")

print("✅ DATASET SUMMARY")

print("================================")

print(f"Train : {len(train\_labels)}")

print(f"Valid : {len(val\_labels)}")

print(f"Test  : {len(test\_labels)}")



\# ==========================================

\# 7. CREATE TF DATASET

\# ==========================================

def create\_tf\_dataset(image\_paths, labels, shuffle=True):



&#x20;   dataset = tf.data.Dataset.from\_tensor\_slices(

&#x20;       (image\_paths, labels)

&#x20;   )



&#x20;   if shuffle and len(labels) > 0:

&#x20;       dataset = dataset.shuffle(len(labels))



&#x20;   def process(img\_path, label):



&#x20;       img = preprocess\_image(img\_path)



&#x20;       label\_onehot = tf.one\_hot(

&#x20;           label,

&#x20;           depth=3

&#x20;       )



&#x20;       return img, label\_onehot



&#x20;   dataset = dataset.map(

&#x20;       process,

&#x20;       num\_parallel\_calls=tf.data.AUTOTUNE

&#x20;   )



&#x20;   dataset = dataset.batch(BATCH\_SIZE)



&#x20;   dataset = dataset.prefetch(tf.data.AUTOTUNE)



&#x20;   return dataset



\# ==========================================

\# 8. FINAL DATASET

\# ==========================================

train\_ds = create\_tf\_dataset(

&#x20;   train\_paths,

&#x20;   train\_labels,

&#x20;   shuffle=True

)



val\_ds = create\_tf\_dataset(

&#x20;   val\_paths,

&#x20;   val\_labels,

&#x20;   shuffle=False

)



test\_ds = create\_tf\_dataset(

&#x20;   test\_paths,

&#x20;   test\_labels,

&#x20;   shuffle=False

)



**print("\\n🔥 PRPD-only Dataset Ready!")**



**PART 2 PRPD-Only Model Architecture**

\# ==========================================

\# PRPD\_2\_Only

\# PART 2 : PRPD-ONLY MODEL ARCHITECTURE

\# ==========================================



from tensorflow.keras import layers

from tensorflow.keras import models

from tensorflow.keras import applications



\# ==========================================

\# 1. INPUT LAYER

\# ==========================================

prpd\_input = layers.Input(

&#x20;   shape=(IMG\_SIZE, IMG\_SIZE, 3),

&#x20;   name='prpd\_input'

)



\# ==========================================

\# 2. PRPD FEATURE EXTRACTOR

\# ==========================================

prpd\_base = applications.MobileNetV2(

&#x20;   input\_shape=(IMG\_SIZE, IMG\_SIZE, 3),

&#x20;   include\_top=False,

&#x20;   weights='imagenet',

&#x20;   name='PRPD\_Only\_MobileNet'

)



prpd\_base.trainable = False



x = prpd\_base(prpd\_input)



x = layers.GlobalAveragePooling2D()(x)



x = layers.Dense(

&#x20;   256,

&#x20;   activation='relu'

)(x)



x = layers.BatchNormalization()(x)



x = layers.Dropout(0.5)(x)



x = layers.Dense(

&#x20;   128,

&#x20;   activation='relu'

)(x)



x = layers.Dropout(0.3)(x)



\# ==========================================

\# 3. OUTPUT LAYER

\# Sigmoid = แสดงคะแนนแยก 3 ตัว

\# ==========================================

output = layers.Dense(

&#x20;   3,

&#x20;   activation='sigmoid',

&#x20;   name='pd\_output'

)(x)



\# ==========================================

\# 4. CREATE MODEL

\# ==========================================

model = models.Model(

&#x20;   inputs=prpd\_input,

&#x20;   outputs=output,

&#x20;   name='PRPD\_2\_Only'

)



\# ==========================================

\# 5. COMPILE MODEL

\# ==========================================

model.compile(

&#x20;   optimizer=tf.keras.optimizers.Adam(

&#x20;       learning\_rate=0.001

&#x20;   ),

&#x20;   loss='binary\_crossentropy',

&#x20;   metrics=\['accuracy']

)



\# ==========================================

\# 6. SHOW MODEL

\# ==========================================

model.summary()



**PART 3 Training and Fine-Tuning**

\# ==========================================

\# PRPD\_2\_Only

\# PART 3 : TRAINING AND FINE-TUNING

\# ==========================================



from tensorflow.keras.callbacks import (

&#x20;   EarlyStopping,

&#x20;   ReduceLROnPlateau,

&#x20;   ModelCheckpoint

)



\# ==========================================

\# 1. CALLBACKS

\# ==========================================

early\_stop = EarlyStopping(

&#x20;   monitor='val\_loss',

&#x20;   patience=8,

&#x20;   restore\_best\_weights=True,

&#x20;   verbose=1

)



reduce\_lr = ReduceLROnPlateau(

&#x20;   monitor='val\_loss',

&#x20;   factor=0.5,

&#x20;   patience=3,

&#x20;   min\_lr=1e-7,

&#x20;   verbose=1

)



checkpoint = ModelCheckpoint(

&#x20;   '/content/drive/MyDrive/PRPD\_2\_Only\_best.keras',

&#x20;   monitor='val\_accuracy',

&#x20;   save\_best\_only=True,

&#x20;   verbose=1

)



\# ==========================================

\# 2. STAGE 1 : TRAIN TOP LAYERS

\# ==========================================

print("\\n🚀 STAGE 1 : TRAIN TOP LAYERS")



history\_1 = model.fit(

&#x20;   train\_ds,

&#x20;   validation\_data=val\_ds,

&#x20;   epochs=20,

&#x20;   callbacks=\[

&#x20;       early\_stop,

&#x20;       reduce\_lr,

&#x20;       checkpoint

&#x20;   ]

)



\# ==========================================

\# 3. STAGE 2 : FINE-TUNING

\# ==========================================

print("\\n🔓 STAGE 2 : FINE-TUNING")



prpd\_base.trainable = True



for layer in prpd\_base.layers\[:100]:

&#x20;   layer.trainable = False



model.compile(

&#x20;   optimizer=tf.keras.optimizers.Adam(

&#x20;       learning\_rate=1e-5

&#x20;   ),

&#x20;   loss='binary\_crossentropy',

&#x20;   metrics=\['accuracy']

)



history\_2 = model.fit(

&#x20;   train\_ds,

&#x20;   validation\_data=val\_ds,

&#x20;   initial\_epoch=history\_1.epoch\[-1],

&#x20;   epochs=60,

&#x20;   callbacks=\[

&#x20;       early\_stop,

&#x20;       reduce\_lr,

&#x20;       checkpoint

&#x20;   ]

)



\# ==========================================

\# 4. SAVE FINAL MODEL

\# ==========================================

final\_path = '/content/drive/MyDrive/PRPD\_2\_Only\_final.keras'



model.save(final\_path)



print("\\n===================================")

print("✅ TRAINING COMPLETE")

print("===================================")

print(f"🔥 Final Model Saved : {final\_path}")



**PART 4 Evaluation and Confusion Matrix**

\# ==========================================

\# PRPD\_2\_Only

\# PART 4 : EVALUATION AND CONFUSION MATRIX

\# ==========================================



import numpy as np

import tensorflow as tf

import matplotlib.pyplot as plt

import seaborn as sns



from sklearn.metrics import (

&#x20;   classification\_report,

&#x20;   confusion\_matrix

)



\# ==========================================

\# 1. LOAD BEST MODEL

\# ==========================================

model\_path = '/content/drive/MyDrive/PRPD\_2\_Only\_best.keras'



model = tf.keras.models.load\_model(model\_path)



print("✅ PRPD\_2\_Only best model loaded!")



\# ==========================================

\# 2. PREDICT TEST SET

\# ==========================================

y\_true = \[]

y\_pred = \[]



print("\\n🤖 Predicting Test Set...")



for images, labels in test\_ds:



&#x20;   preds = model.predict(

&#x20;       images,

&#x20;       verbose=0

&#x20;   )



&#x20;   pred\_class = np.argmax(

&#x20;       preds,

&#x20;       axis=1

&#x20;   )



&#x20;   true\_class = np.argmax(

&#x20;       labels.numpy(),

&#x20;       axis=1

&#x20;   )



&#x20;   y\_true.extend(true\_class)

&#x20;   y\_pred.extend(pred\_class)



\# ==========================================

\# 3. CONFUSION MATRIX

\# ==========================================

cm = confusion\_matrix(

&#x20;   y\_true,

&#x20;   y\_pred

)



plt.figure(figsize=(8, 6))



sns.heatmap(

&#x20;   cm,

&#x20;   annot=True,

&#x20;   fmt='d',

&#x20;   cmap='Blues',

&#x20;   xticklabels=CLASS\_NAMES,

&#x20;   yticklabels=CLASS\_NAMES

)



plt.title(

&#x20;   'PRPD\_2\_Only Confusion Matrix',

&#x20;   fontsize=16

)



plt.xlabel(

&#x20;   'Predicted Class',

&#x20;   fontsize=12

)



plt.ylabel(

&#x20;   'True Class',

&#x20;   fontsize=12

)



plt.show()



\# ==========================================

\# 4. CLASSIFICATION REPORT

\# ==========================================

print("\\n======================================")

print("📊 CLASSIFICATION REPORT")

print("======================================\\n")



print(

&#x20;   classification\_report(

&#x20;       y\_true,

&#x20;       y\_pred,

&#x20;       target\_names=CLASS\_NAMES

&#x20;   )

)



\# ==========================================

\# 5. FINAL ACCURACY

\# ==========================================

accuracy = np.mean(

&#x20;   np.array(y\_true) == np.array(y\_pred)

) \* 100



print("======================================")

print(f"🔥 FINAL TEST ACCURACY : {accuracy:.2f}%")

print("======================================")



\# ==========================================

\# 6. SHOW WRONG PREDICTIONS

\# ==========================================

print("\\n🔍 Searching wrong predictions...")



wrong\_count = 0



for images, labels in test\_ds:



&#x20;   preds = model.predict(

&#x20;       images,

&#x20;       verbose=0

&#x20;   )



&#x20;   pred\_class = np.argmax(

&#x20;       preds,

&#x20;       axis=1

&#x20;   )



&#x20;   true\_class = np.argmax(

&#x20;       labels.numpy(),

&#x20;       axis=1

&#x20;   )



&#x20;   for i in range(len(pred\_class)):



&#x20;       if pred\_class\[i] != true\_class\[i]:



&#x20;           wrong\_count += 1



&#x20;           plt.figure(figsize=(5, 5))



&#x20;           plt.imshow(images\[i])



&#x20;           plt.title(

&#x20;               f"True: {CLASS\_NAMES\[true\_class\[i]]}\\n"

&#x20;               f"Pred: {CLASS\_NAMES\[pred\_class\[i]]}"

&#x20;           )



&#x20;           plt.axis('off')



&#x20;           plt.show()



print(f"\\n❌ Total Wrong Predictions : {wrong\_count}")



**PART 5 Real Image Prediction**

\# ==========================================

\# PRPD\_2\_Only

\# PART 5 : REAL IMAGE PREDICTION

\# Auto Mount Google Drive

\# ==========================================



import os

import tensorflow as tf

import numpy as np

import matplotlib.pyplot as plt



from google.colab import drive

from google.colab import files

from tensorflow.keras.preprocessing import image



\# ==========================================

\# 1. AUTO CONNECT GOOGLE DRIVE

\# ==========================================

if not os.path.exists('/content/drive/MyDrive'):



&#x20;   print("🔄 Connecting Google Drive...")



&#x20;   drive.mount('/content/drive')



\# ==========================================

\# 2. LOAD MODEL

\# ==========================================

model\_path = '/content/drive/MyDrive/PRPD\_2\_Only\_best.keras'



model = tf.keras.models.load\_model(

&#x20;   model\_path

)



print("✅ PRPD\_2\_Only model loaded!")



\# ==========================================

\# 3. CONFIG

\# ==========================================

CLASS\_NAMES = \[

&#x20;   'Corona',

&#x20;   'Surface',

&#x20;   'Internal'

]



IMG\_SIZE = 224



\# ==========================================

\# 4. PREPROCESS FUNCTION

\# ==========================================

def preprocess\_image(img\_path):



&#x20;   img = tf.io.read\_file(img\_path)



&#x20;   img = tf.image.decode\_jpeg(

&#x20;       img,

&#x20;       channels=3

&#x20;   )



&#x20;   gray = tf.image.rgb\_to\_grayscale(img)



&#x20;   gray = tf.cast(

&#x20;       gray,

&#x20;       tf.float32

&#x20;   )



&#x20;   # Contrast Stretching

&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (

&#x20;       gray - pmin

&#x20;   ) / (

&#x20;       pmax - pmin + 1e-5

&#x20;   )



&#x20;   # Invert

&#x20;   final = 1.0 - stretched



&#x20;   final = tf.image.grayscale\_to\_rgb(

&#x20;       final

&#x20;   )



&#x20;   final = tf.image.resize\_with\_pad(

&#x20;       final,

&#x20;       IMG\_SIZE,

&#x20;       IMG\_SIZE

&#x20;   )



&#x20;   return final



\# ==========================================

\# 5. UPLOAD IMAGE

\# ==========================================

print("\\n📥 Upload 1 PRPD image")



uploaded = files.upload()



uploaded\_files = list(uploaded.keys())



if len(uploaded\_files) != 1:



&#x20;   raise ValueError(

&#x20;       "❌ Please upload only 1 image"

&#x20;   )



img\_path = uploaded\_files\[0]



\# ==========================================

\# 6. PREPROCESS IMAGE

\# ==========================================

img = preprocess\_image(

&#x20;   img\_path

)



img\_input = tf.expand\_dims(

&#x20;   img,

&#x20;   axis=0

)



\# ==========================================

\# 7. PREDICT

\# ==========================================

preds = model.predict(

&#x20;   img\_input,

&#x20;   verbose=0

)\[0]



\# ==========================================

\# 8. SHOW IMAGE

\# ==========================================

plt.figure(figsize=(6,6))



plt.imshow(

&#x20;   image.load\_img(img\_path)

)



plt.title("PRPD Image")



plt.axis('off')



plt.show()



\# ==========================================

\# 9. SHOW RESULT

\# ==========================================

print("\\n======================================")

print("📊 PRPD ANALYSIS")

print("======================================\\n")



for i in range(3):



&#x20;   percent = preds\[i] \* 100



&#x20;   bar = "█" \* int(percent / 5)



&#x20;   print(

&#x20;       f"{CLASS\_NAMES\[i]:<10} : "

&#x20;       f"{percent:>6.2f}% "

&#x20;       f"{bar}"

&#x20;   )



\# ==========================================

\# 10. FINAL RESULT

\# ==========================================

top\_idx = np.argmax(preds)



top\_class = CLASS\_NAMES\[top\_idx]



top\_score = preds\[top\_idx] \* 100



print("\\n======================================")



print(

&#x20;   f"🔥 FINAL RESULT : "

&#x20;   f"{top\_class} "

&#x20;   f"({top\_score:.2f}%)"

)



print("======================================")



\# ==========================================

\# 11. MIXED PD WARNING

\# ==========================================

sorted\_scores = np.sort(preds)\[::-1]



if sorted\_scores\[1] > 0.30:



&#x20;   print("\\n⚠️ Possible Mixed PD Detected")



&#x20;   print(

&#x20;       "Multiple PD types show significant probability"

&#x20;   )



**PART 5 Real Image Prediction (Non Idetified)**

\# ==========================================

\# PRPD\_2\_Only

\# PART 5 : REAL IMAGE PREDICTION

\# Auto Mount Google Drive

\# With Non-identified Bar + Internal Safety Rule

\# ==========================================



import os

import cv2

import tensorflow as tf

import numpy as np

import matplotlib.pyplot as plt



from google.colab import drive

from google.colab import files

from tensorflow.keras.preprocessing import image



\# ==========================================

\# 1. AUTO CONNECT GOOGLE DRIVE

\# ==========================================

if not os.path.exists('/content/drive/MyDrive'):

&#x20;   print("🔄 Connecting Google Drive...")

&#x20;   drive.mount('/content/drive')



\# ==========================================

\# 2. LOAD MODEL

\# ==========================================

model\_path = '/content/drive/MyDrive/PRPD\_2\_Only\_best.keras'



model = tf.keras.models.load\_model(model\_path)



print("✅ PRPD\_2\_Only model loaded!")



\# ==========================================

\# 3. CONFIG

\# ==========================================

CLASS\_NAMES = \[

&#x20;   'Corona',

&#x20;   'Surface',

&#x20;   'Internal'

]



IMG\_SIZE = 224

CONFIDENCE\_THRESHOLD = 85.0



\# ==========================================

\# 4. PREPROCESS FUNCTION

\# ==========================================

def preprocess\_image(img\_path):



&#x20;   img = tf.io.read\_file(img\_path)



&#x20;   img = tf.image.decode\_image(

&#x20;       img,

&#x20;       channels=3,

&#x20;       expand\_animations=False

&#x20;   )



&#x20;   gray = tf.image.rgb\_to\_grayscale(img)

&#x20;   gray = tf.cast(gray, tf.float32)



&#x20;   # Contrast Stretching

&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (gray - pmin) / (pmax - pmin + 1e-5)



&#x20;   # Invert

&#x20;   final = 1.0 - stretched

&#x20;   final = tf.image.grayscale\_to\_rgb(final)



&#x20;   final = tf.image.resize\_with\_pad(

&#x20;       final,

&#x20;       IMG\_SIZE,

&#x20;       IMG\_SIZE

&#x20;   )



&#x20;   return final



\# ==========================================

\# 5. INTERNAL RULE CHECK - FIXED VERSION

\# เหมาะกับ Internal ที่เป็นกลุ่มจุดใหญ่ 2 ฝั่ง

\# ==========================================

def internal\_sanity\_check\_from\_file(img\_path, debug=True):



&#x20;   raw = cv2.imread(img\_path)



&#x20;   if raw is None:

&#x20;       return False



&#x20;   raw = cv2.cvtColor(raw, cv2.COLOR\_BGR2RGB)



&#x20;   h, w, \_ = raw.shape



&#x20;   # Crop graph area

&#x20;   crop = raw\[

&#x20;       int(h \* 0.18):int(h \* 0.82),

&#x20;       int(w \* 0.18):int(w \* 0.88)

&#x20;   ]



&#x20;   gray = cv2.cvtColor(crop, cv2.COLOR\_RGB2GRAY)



&#x20;   # Detect dark PD points

&#x20;   dark\_mask = gray < 210



&#x20;   # Detect red points

&#x20;   r = crop\[:, :, 0].astype(np.float32)

&#x20;   g = crop\[:, :, 1].astype(np.float32)

&#x20;   b = crop\[:, :, 2].astype(np.float32)



&#x20;   red\_mask = (

&#x20;       (r > 120) \&

&#x20;       (r > g \* 1.15) \&

&#x20;       (r > b \* 1.15)

&#x20;   )



&#x20;   mask = (dark\_mask | red\_mask).astype(np.uint8)



&#x20;   # Remove very small noise

&#x20;   kernel = np.ones((2, 2), np.uint8)



&#x20;   mask = cv2.morphologyEx(

&#x20;       mask,

&#x20;       cv2.MORPH\_OPEN,

&#x20;       kernel

&#x20;   )



&#x20;   # Connected components

&#x20;   num\_labels, labels, stats, \_ = cv2.connectedComponentsWithStats(

&#x20;       mask,

&#x20;       connectivity=8

&#x20;   )



&#x20;   clean\_mask = np.zeros\_like(mask)



&#x20;   for i in range(1, num\_labels):



&#x20;       area = stats\[i, cv2.CC\_STAT\_AREA]

&#x20;       x = stats\[i, cv2.CC\_STAT\_LEFT]

&#x20;       y = stats\[i, cv2.CC\_STAT\_TOP]

&#x20;       ww = stats\[i, cv2.CC\_STAT\_WIDTH]

&#x20;       hh = stats\[i, cv2.CC\_STAT\_HEIGHT]



&#x20;       # Remove axes / sine / text-like long lines

&#x20;       very\_long\_horizontal = (ww > 120 and hh < 10)

&#x20;       very\_long\_vertical = (hh > 120 and ww < 10)



&#x20;       # Remove tiny noise

&#x20;       too\_small = area < 2



&#x20;       # Remove huge background/text blocks

&#x20;       too\_large = area > 4000



&#x20;       if (

&#x20;           not very\_long\_horizontal and

&#x20;           not very\_long\_vertical and

&#x20;           not too\_small and

&#x20;           not too\_large

&#x20;       ):

&#x20;           clean\_mask\[labels == i] = 1



&#x20;   ch, cw = clean\_mask.shape



&#x20;   # แบ่งเป็น 4 quadrant

&#x20;   upper\_left = np.sum(clean\_mask\[:ch//2, :cw//2])

&#x20;   upper\_right = np.sum(clean\_mask\[:ch//2, cw//2:])

&#x20;   lower\_left = np.sum(clean\_mask\[ch//2:, :cw//2])

&#x20;   lower\_right = np.sum(clean\_mask\[ch//2:, cw//2:])



&#x20;   upper = upper\_left + upper\_right

&#x20;   lower = lower\_left + lower\_right

&#x20;   left = upper\_left + lower\_left

&#x20;   right = upper\_right + lower\_right



&#x20;   total\_ul = upper + lower + 1e-6

&#x20;   total\_lr = left + right + 1e-6



&#x20;   upper\_ratio = upper / total\_ul

&#x20;   lower\_ratio = lower / total\_ul



&#x20;   left\_ratio = left / total\_lr

&#x20;   right\_ratio = right / total\_lr



&#x20;   # ==========================================

\# 5. INTERNAL RULE CHECK - FIXED VERSION

\# เหมาะกับ Internal ที่เป็นกลุ่มจุดใหญ่ 2 ฝั่ง

\# ==========================================

def internal\_sanity\_check\_from\_file(img\_path, debug=True):



&#x20;   raw = cv2.imread(img\_path)



&#x20;   if raw is None:

&#x20;       return False



&#x20;   raw = cv2.cvtColor(raw, cv2.COLOR\_BGR2RGB)



&#x20;   h, w, \_ = raw.shape



&#x20;   # Crop graph area

&#x20;   crop = raw\[

&#x20;       int(h \* 0.18):int(h \* 0.82),

&#x20;       int(w \* 0.18):int(w \* 0.88)

&#x20;   ]



&#x20;   gray = cv2.cvtColor(crop, cv2.COLOR\_RGB2GRAY)



&#x20;   # Detect dark PD points

&#x20;   dark\_mask = gray < 210



&#x20;   # Detect red points

&#x20;   r = crop\[:, :, 0].astype(np.float32)

&#x20;   g = crop\[:, :, 1].astype(np.float32)

&#x20;   b = crop\[:, :, 2].astype(np.float32)



&#x20;   red\_mask = (

&#x20;       (r > 120) \&

&#x20;       (r > g \* 1.15) \&

&#x20;       (r > b \* 1.15)

&#x20;   )



&#x20;   mask = (dark\_mask | red\_mask).astype(np.uint8)



&#x20;   # Remove very small noise

&#x20;   kernel = np.ones((2, 2), np.uint8)



&#x20;   mask = cv2.morphologyEx(

&#x20;       mask,

&#x20;       cv2.MORPH\_OPEN,

&#x20;       kernel

&#x20;   )



&#x20;   # Connected components

&#x20;   num\_labels, labels, stats, \_ = cv2.connectedComponentsWithStats(

&#x20;       mask,

&#x20;       connectivity=8

&#x20;   )



&#x20;   clean\_mask = np.zeros\_like(mask)



&#x20;   for i in range(1, num\_labels):



&#x20;       area = stats\[i, cv2.CC\_STAT\_AREA]

&#x20;       x = stats\[i, cv2.CC\_STAT\_LEFT]

&#x20;       y = stats\[i, cv2.CC\_STAT\_TOP]

&#x20;       ww = stats\[i, cv2.CC\_STAT\_WIDTH]

&#x20;       hh = stats\[i, cv2.CC\_STAT\_HEIGHT]



&#x20;       # Remove axes / sine / text-like long lines

&#x20;       very\_long\_horizontal = (ww > 120 and hh < 10)

&#x20;       very\_long\_vertical = (hh > 120 and ww < 10)



&#x20;       # Remove tiny noise

&#x20;       too\_small = area < 2



&#x20;       # Remove huge background/text blocks

&#x20;       too\_large = area > 4000



&#x20;       if (

&#x20;           not very\_long\_horizontal and

&#x20;           not very\_long\_vertical and

&#x20;           not too\_small and

&#x20;           not too\_large

&#x20;       ):

&#x20;           clean\_mask\[labels == i] = 1



&#x20;   ch, cw = clean\_mask.shape



&#x20;   # แบ่งเป็น 4 quadrant

&#x20;   upper\_left = np.sum(clean\_mask\[:ch//2, :cw//2])

&#x20;   upper\_right = np.sum(clean\_mask\[:ch//2, cw//2:])

&#x20;   lower\_left = np.sum(clean\_mask\[ch//2:, :cw//2])

&#x20;   lower\_right = np.sum(clean\_mask\[ch//2:, cw//2:])



&#x20;   upper = upper\_left + upper\_right

&#x20;   lower = lower\_left + lower\_right

&#x20;   left = upper\_left + lower\_left

&#x20;   right = upper\_right + lower\_right



&#x20;   total\_ul = upper + lower + 1e-6

&#x20;   total\_lr = left + right + 1e-6



&#x20;   upper\_ratio = upper / total\_ul

&#x20;   lower\_ratio = lower / total\_ul



&#x20;   left\_ratio = left / total\_lr

&#x20;   right\_ratio = right / total\_lr



&#x20;   # Internal ควรมี PD ทั้งฝั่งบนและล่าง

&#x20;   upper\_lower\_ok = (

&#x20;       upper\_ratio >= 0.15 and

&#x20;       lower\_ratio >= 0.15

&#x20;   )



&#x20;   # Internal มักมี pattern กระจายสองช่วง phase

&#x20;   left\_right\_ok = (

&#x20;       left\_ratio >= 0.15 and

&#x20;       right\_ratio >= 0.15

&#x20;   )



&#x20;   internal\_ok = upper\_lower\_ok and left\_right\_ok



&#x20;   if debug:

&#x20;       print("\\n🔎 INTERNAL RULE CHECK")

&#x20;       print(f"Upper ratio : {upper\_ratio:.2f}")

&#x20;       print(f"Lower ratio : {lower\_ratio:.2f}")

&#x20;       print(f"Left ratio  : {left\_ratio:.2f}")

&#x20;       print(f"Right ratio : {right\_ratio:.2f}")

&#x20;       print(f"Internal OK : {internal\_ok}")



&#x20;   return internal\_ok



&#x20;   if debug:

&#x20;       print("\\n🔎 INTERNAL RULE CHECK")

&#x20;       print(f"Upper ratio : {upper\_ratio:.2f}")

&#x20;       print(f"Lower ratio : {lower\_ratio:.2f}")

&#x20;       print(f"Internal OK : {internal\_ok}")



&#x20;   return internal\_ok

\# ==========================================

\# 6. UPLOAD IMAGE

\# ==========================================

print("\\n📥 Upload 1 PRPD image")



uploaded = files.upload()

uploaded\_files = list(uploaded.keys())



if len(uploaded\_files) != 1:

&#x20;   raise ValueError("❌ Please upload only 1 image")



img\_path = uploaded\_files\[0]



\# ==========================================

\# 7. PREPROCESS IMAGE

\# ==========================================

img = preprocess\_image(img\_path)

img\_input = tf.expand\_dims(img, axis=0)



\# ==========================================

\# 8. PREDICT

\# ==========================================

preds = model.predict(

&#x20;   img\_input,

&#x20;   verbose=0

)\[0]



\# ==========================================

\# 9. SHOW IMAGE

\# ==========================================

plt.figure(figsize=(6, 6))

plt.imshow(image.load\_img(img\_path))

plt.title("PRPD Image")

plt.axis("off")

plt.show()



\# ==========================================

\# 10. ANALYSIS RESULT

\# ==========================================

scores\_percent = preds \* 100



top\_idx = np.argmax(scores\_percent)

top\_class = CLASS\_NAMES\[top\_idx]

top\_score = scores\_percent\[top\_idx]



final\_result = top\_class

final\_score = top\_score

status = "identified"

rule\_rejected = False



\# ==========================================

\# INTERNAL SAFETY RULE

\# ==========================================

if top\_class == "Internal" and top\_score >= CONFIDENCE\_THRESHOLD:



&#x20;   # ถ้ามั่นใจสูงมาก ให้ผ่าน

&#x20;   if top\_score >= 95.0:



&#x20;       status = "identified\_with\_tf\_recommendation"



&#x20;   # ถ้ามั่นใจระดับกลาง ค่อยใช้ rule check

&#x20;   else:



&#x20;       internal\_ok = internal\_sanity\_check\_from\_file(

&#x20;           img\_path,

&#x20;           debug=True

&#x20;       )



&#x20;       if not internal\_ok:



&#x20;           final\_result = "Non-identified"



&#x20;           final\_score = 100.0



&#x20;           status = "rule\_rejected\_internal"



&#x20;           rule\_rejected = True



\# ==========================================

\# CONFIDENCE CHECK

\# ==========================================

high\_conf\_indices = np.where(

&#x20;   scores\_percent >= CONFIDENCE\_THRESHOLD

)\[0]



if len(high\_conf\_indices) != 1:

&#x20;   final\_result = "Non-identified"

&#x20;   final\_score = 100.0

&#x20;   status = "low\_confidence\_or\_mixed"



\# ==========================================

\# NON-IDENTIFIED SCORE

\# ==========================================

max\_score = np.max(scores\_percent)



if final\_result == "Non-identified":

&#x20;   if rule\_rejected:

&#x20;       non\_identified\_percent = 100.0

&#x20;   else:

&#x20;       non\_identified\_score = max(

&#x20;           0,

&#x20;           CONFIDENCE\_THRESHOLD - max\_score

&#x20;       )



&#x20;       non\_identified\_percent = (

&#x20;           non\_identified\_score /

&#x20;           CONFIDENCE\_THRESHOLD

&#x20;       ) \* 100

else:

&#x20;   non\_identified\_percent = 0.0



\# ==========================================

\# SHOW RESULT

\# ==========================================

print("\\n======================================")

print("📊 PD ANALYSIS RESULT")

print("======================================\\n")



for i in range(3):



&#x20;   percent = scores\_percent\[i]

&#x20;   bar = "█" \* int(percent / 5)



&#x20;   print(

&#x20;       f"{CLASS\_NAMES\[i]:<15} : "

&#x20;       f"{percent:>6.2f}% "

&#x20;       f"{bar}"

&#x20;   )



non\_bar = "█" \* int(non\_identified\_percent / 5)



print(

&#x20;   f"{'Non-identified':<15} : "

&#x20;   f"{non\_identified\_percent:>6.2f}% "

&#x20;   f"{non\_bar}"

)



\# ==========================================

\# FINAL RESULT

\# ==========================================

print("\\n======================================")



if final\_result == "Non-identified":



&#x20;   print(

&#x20;       f"⚠️ FINAL RESULT : "

&#x20;       f"Non-identified "

&#x20;       f"({non\_identified\_percent:.2f}%)"

&#x20;   )



&#x20;   print(f"Reason : {status}")



&#x20;   print(

&#x20;       "Recommendation : "

&#x20;       "TF Map analysis is required "

&#x20;       "for further PD interpretation."

&#x20;   )



if status == "identified\_with\_tf\_recommendation":

&#x20;   print(

&#x20;       "Recommendation : "

&#x20;       "TF Map analysis is recommended "

&#x20;       "to confirm the Internal PD interpretation."

&#x20;   )



print("======================================")

