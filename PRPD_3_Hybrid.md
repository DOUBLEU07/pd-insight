**PART 1 Dataset Preparation and Pair Loading**

\# ==========================================

\# PRPD\_TF\_1\_sigmoid

\# PART 1 : LOAD HYBRID DATASET

\# ==========================================



import os

import shutil

import numpy as np

import tensorflow as tf



\# ==========================================

\# 1. CONNECT GOOGLE DRIVE

\# ==========================================

if not os.path.exists('/content/drive'):

&#x20;   from google.colab import drive

&#x20;   drive.mount('/content/drive')



\# ==========================================

\# 2. COPY DATASET TO LOCAL SSD

\# ==========================================

DRIVE\_PATH = '/content/drive/MyDrive/PD\_final\_dataset'

LOCAL\_PATH = '/content/local\_pd\_final'



\# ลบของเก่า

if os.path.exists(LOCAL\_PATH):

&#x20;   shutil.rmtree(LOCAL\_PATH)



print("📦 Copy dataset to local SSD...")

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



train\_dir = os.path.join(

&#x20;   LOCAL\_PATH,

&#x20;   'train'

)



val\_dir = os.path.join(

&#x20;   LOCAL\_PATH,

&#x20;   'validation'

)



test\_dir = os.path.join(

&#x20;   LOCAL\_PATH,

&#x20;   'test'

)



\# ==========================================

\# 4. IMAGE PREPROCESS

\# ==========================================

def preprocess\_image(img\_path):



&#x20;   img = tf.io.read\_file(img\_path)



&#x20;   # รองรับ jpg/png

&#x20;   img = tf.image.decode\_image(

&#x20;       img,

&#x20;       channels=3,

&#x20;       expand\_animations=False

&#x20;   )



&#x20;   # grayscale

&#x20;   gray = tf.image.rgb\_to\_grayscale(img)



&#x20;   gray = tf.cast(

&#x20;       gray,

&#x20;       tf.float32

&#x20;   )



&#x20;   # contrast stretching

&#x20;   pmin = tf.reduce\_min(gray)

&#x20;   pmax = tf.reduce\_max(gray)



&#x20;   stretched = (

&#x20;       gray - pmin

&#x20;   ) / (

&#x20;       pmax - pmin + 1e-5

&#x20;   )



&#x20;   # invert

&#x20;   final = 1.0 - stretched



&#x20;   # convert กลับ RGB

&#x20;   final = tf.image.grayscale\_to\_rgb(final)



&#x20;   # resize

&#x20;   final = tf.image.resize\_with\_pad(

&#x20;       final,

&#x20;       IMG\_SIZE,

&#x20;       IMG\_SIZE

&#x20;   )



&#x20;   return final



\# ==========================================

\# 5. LOAD HYBRID DATASET

\# ==========================================

def load\_hybrid\_dataset(base\_dir):



&#x20;   prpd\_images = \[]

&#x20;   tf\_images = \[]

&#x20;   labels = \[]



&#x20;   for class\_idx, class\_name in enumerate(CLASS\_NAMES):



&#x20;       class\_dir = os.path.join(

&#x20;           base\_dir,

&#x20;           class\_name

&#x20;       )



&#x20;       print(f"\\n📂 Loading: {class\_name}")



&#x20;       if not os.path.exists(class\_dir):



&#x20;           print(f"❌ Missing folder: {class\_dir}")



&#x20;           continue



&#x20;       files = sorted(

&#x20;           os.listdir(class\_dir)

&#x20;       )



&#x20;       # หาเฉพาะ PRPD

&#x20;       prpd\_files = \[

&#x20;           f for f in files

&#x20;           if 'PRPD' in f

&#x20;       ]



&#x20;       print(f"✅ PRPD files: {len(prpd\_files)}")



&#x20;       pair\_count = 0



&#x20;       for prpd\_file in prpd\_files:



&#x20;           # สร้างชื่อ TF

&#x20;           tf\_file = prpd\_file.replace(

&#x20;               'PRPD',

&#x20;               'TF'

&#x20;           )



&#x20;           prpd\_path = os.path.join(

&#x20;               class\_dir,

&#x20;               prpd\_file

&#x20;           )



&#x20;           tf\_path = os.path.join(

&#x20;               class\_dir,

&#x20;               tf\_file

&#x20;           )



&#x20;           # เช็ก pair

&#x20;           if not os.path.exists(tf\_path):



&#x20;               print(f"⚠️ Missing TF pair: {tf\_file}")



&#x20;               continue



&#x20;           prpd\_images.append(prpd\_path)



&#x20;           tf\_images.append(tf\_path)



&#x20;           labels.append(class\_idx)



&#x20;           pair\_count += 1



&#x20;       print(f"🔥 Hybrid pairs: {pair\_count}")



&#x20;   return prpd\_images, tf\_images, labels



\# ==========================================

\# 6. LOAD TRAIN / VAL / TEST

\# ==========================================

train\_prpd, train\_tf, train\_labels = load\_hybrid\_dataset(

&#x20;   train\_dir

)



val\_prpd, val\_tf, val\_labels = load\_hybrid\_dataset(

&#x20;   val\_dir

)



test\_prpd, test\_tf, test\_labels = load\_hybrid\_dataset(

&#x20;   test\_dir

)



print("\\n================================")

print("✅ DATASET SUMMARY")

print("================================")



print(f"Train : {len(train\_labels)}")

print(f"Valid : {len(val\_labels)}")

print(f"Test  : {len(test\_labels)}")



\# ==========================================

\# 7. CREATE TF DATASET

\# ==========================================

def create\_tf\_dataset(

&#x20;   prpd\_paths,

&#x20;   tf\_paths,

&#x20;   labels,

&#x20;   shuffle=True

):



&#x20;   dataset = tf.data.Dataset.from\_tensor\_slices(

&#x20;       (

&#x20;           prpd\_paths,

&#x20;           tf\_paths,

&#x20;           labels

&#x20;       )

&#x20;   )



&#x20;   # กัน error dataset ว่าง

&#x20;   if shuffle and len(labels) > 0:



&#x20;       dataset = dataset.shuffle(

&#x20;           len(labels)

&#x20;       )



&#x20;   # process function

&#x20;   def process(

&#x20;       prpd\_path,

&#x20;       tf\_path,

&#x20;       label

&#x20;   ):



&#x20;       prpd\_img = preprocess\_image(

&#x20;           prpd\_path

&#x20;       )



&#x20;       tf\_img = preprocess\_image(

&#x20;           tf\_path

&#x20;       )



&#x20;       # one-hot สำหรับ sigmoid

&#x20;       label\_onehot = tf.one\_hot(

&#x20;           label,

&#x20;           depth=3

&#x20;       )



&#x20;       return (

&#x20;           {

&#x20;               'prpd\_input': prpd\_img,

&#x20;               'tf\_input': tf\_img

&#x20;           },

&#x20;           label\_onehot

&#x20;       )



&#x20;   dataset = dataset.map(

&#x20;       process,

&#x20;       num\_parallel\_calls=tf.data.AUTOTUNE

&#x20;   )



&#x20;   dataset = dataset.batch(

&#x20;       BATCH\_SIZE

&#x20;   )



&#x20;   dataset = dataset.prefetch(

&#x20;       tf.data.AUTOTUNE

&#x20;   )



&#x20;   return dataset



\# ==========================================

\# 8. FINAL DATASET

\# ==========================================

train\_ds = create\_tf\_dataset(

&#x20;   train\_prpd,

&#x20;   train\_tf,

&#x20;   train\_labels,

&#x20;   shuffle=True

)



val\_ds = create\_tf\_dataset(

&#x20;   val\_prpd,

&#x20;   val\_tf,

&#x20;   val\_labels,

&#x20;   shuffle=False

)



test\_ds = create\_tf\_dataset(

&#x20;   test\_prpd,

&#x20;   test\_tf,

&#x20;   test\_labels,

&#x20;   shuffle=False

)



print("\\n🔥 Hybrid Dataset Ready!")



**PART 2 Hybrid PRPD-TF Deep Learning Architecture**

\# ==========================================

\# PRPD\_TF\_1\_sigmoid

\# PART 2 : HYBRID MODEL

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



tf\_input = layers.Input(

&#x20;   shape=(IMG\_SIZE, IMG\_SIZE, 3),

&#x20;   name='tf\_input'

)



\# ==========================================

\# 2. PRPD BRANCH

\# ==========================================

prpd\_base = applications.MobileNetV2(

&#x20;   input\_shape=(IMG\_SIZE, IMG\_SIZE, 3),

&#x20;   include\_top=False,

&#x20;   weights='imagenet',

&#x20;   name='PRPD\_MobileNet'

)



\# Freeze base model

prpd\_base.trainable = False



\# Extract feature

prpd\_features = prpd\_base(

&#x20;   prpd\_input

)



prpd\_features = layers.GlobalAveragePooling2D()(

&#x20;   prpd\_features

)



prpd\_features = layers.Dense(

&#x20;   128,

&#x20;   activation='relu'

)(

&#x20;   prpd\_features

)



prpd\_features = layers.Dropout(0.3)(

&#x20;   prpd\_features

)



\# ==========================================

\# 3. TF BRANCH

\# ==========================================

tf\_base = applications.MobileNetV2(

&#x20;   input\_shape=(IMG\_SIZE, IMG\_SIZE, 3),

&#x20;   include\_top=False,

&#x20;   weights='imagenet',

&#x20;   name='TF\_MobileNet'

)



\# Freeze base model

tf\_base.trainable = False



\# Extract feature

tf\_features = tf\_base(

&#x20;   tf\_input

)



tf\_features = layers.GlobalAveragePooling2D()(

&#x20;   tf\_features

)



tf\_features = layers.Dense(

&#x20;   128,

&#x20;   activation='relu'

)(

&#x20;   tf\_features

)



tf\_features = layers.Dropout(0.3)(

&#x20;   tf\_features

)



\# ==========================================

\# 4. MERGE FEATURES

\# ==========================================

merged = layers.Concatenate()(\[

&#x20;   prpd\_features,

&#x20;   tf\_features

])



\# ==========================================

\# 5. HYBRID DECISION LAYER

\# ==========================================

x = layers.Dense(

&#x20;   256,

&#x20;   activation='relu'

)(

&#x20;   merged

)



x = layers.BatchNormalization()(x)



x = layers.Dropout(0.5)(x)



x = layers.Dense(

&#x20;   128,

&#x20;   activation='relu'

)(x)



x = layers.Dropout(0.3)(x)



\# ==========================================

\# 6. OUTPUT LAYER

\# ==========================================

output = layers.Dense(

&#x20;   3,

&#x20;   activation='sigmoid',

&#x20;   name='pd\_output'

)(x)



\# ==========================================

\# 7. CREATE MODEL

\# ==========================================

model = models.Model(

&#x20;   inputs=\[

&#x20;       prpd\_input,

&#x20;       tf\_input

&#x20;   ],

&#x20;   outputs=output

)



\# ==========================================

\# 8. COMPILE MODEL

\# ==========================================

model.compile(

&#x20;   optimizer=tf.keras.optimizers.Adam(

&#x20;       learning\_rate=0.001

&#x20;   ),



&#x20;   loss='binary\_crossentropy',



&#x20;   metrics=\[

&#x20;       'accuracy'

&#x20;   ]

)



\# ==========================================

\# 9. SHOW MODEL

\# ==========================================

model.summary()



**PART 3 Model Training and Fine-Tuning**

\# ==========================================

\# PRPD\_TF\_1\_sigmoid

\# PART 3 : TRAINING

\# ==========================================



from tensorflow.keras.callbacks import (

&#x20;   EarlyStopping,

&#x20;   ReduceLROnPlateau,

&#x20;   ModelCheckpoint

)



\# ==========================================

\# 1. CALLBACKS

\# ==========================================



\# หยุดเมื่อเริ่ม overfit

early\_stop = EarlyStopping(

&#x20;   monitor='val\_loss',

&#x20;   patience=8,

&#x20;   restore\_best\_weights=True,

&#x20;   verbose=1

)



\# ลด learning rate อัตโนมัติ

reduce\_lr = ReduceLROnPlateau(

&#x20;   monitor='val\_loss',

&#x20;   factor=0.5,

&#x20;   patience=3,

&#x20;   min\_lr=1e-7,

&#x20;   verbose=1

)



\# เซฟโมเดลที่ดีที่สุด

checkpoint = ModelCheckpoint(

&#x20;   '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras',

&#x20;   monitor='val\_accuracy',

&#x20;   save\_best\_only=True,

&#x20;   verbose=1

)



\# ==========================================

\# 2. TRAIN STAGE 1

\# Freeze MobileNet

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

\# 3. FINE TUNING

\# ==========================================



print("\\n🔓 STAGE 2 : FINE TUNING")



\# เปิด trainable

prpd\_base.trainable = True

tf\_base.trainable = True



\# Freeze ครึ่งล่างไว้

for layer in prpd\_base.layers\[:100]:

&#x20;   layer.trainable = False



for layer in tf\_base.layers\[:100]:

&#x20;   layer.trainable = False



\# compile ใหม่

model.compile(



&#x20;   optimizer=tf.keras.optimizers.Adam(

&#x20;       learning\_rate=1e-5

&#x20;   ),



&#x20;   loss='binary\_crossentropy',



&#x20;   metrics=\['accuracy']

)



\# ==========================================

\# 4. TRAIN STAGE 2

\# ==========================================



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

\# 5. SAVE FINAL MODEL

\# ==========================================



final\_path = '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_final.keras'



model.save(final\_path)



print("\\n===================================")

print("✅ TRAINING COMPLETE")

print("===================================")



print(f"🔥 Final Model Saved : {final\_path}")



**PART 4 Performance Evaluation**

\# ==========================================

\# PRPD\_TF\_1\_sigmoid

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

model\_path = '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras'



model = tf.keras.models.load\_model(

&#x20;   model\_path

)



print("✅ Best model loaded!")



\# ==========================================

\# 2. PREDICT TEST SET

\# ==========================================

y\_true = \[]

y\_pred = \[]



print("\\n🤖 Predicting Test Set...")



for batch\_data, batch\_labels in test\_ds:



&#x20;   preds = model.predict(

&#x20;       batch\_data,

&#x20;       verbose=0

&#x20;   )



&#x20;   # sigmoid → argmax

&#x20;   pred\_class = np.argmax(

&#x20;       preds,

&#x20;       axis=1

&#x20;   )



&#x20;   true\_class = np.argmax(

&#x20;       batch\_labels.numpy(),

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



plt.figure(figsize=(8,6))



sns.heatmap(

&#x20;   cm,

&#x20;   annot=True,

&#x20;   fmt='d',

&#x20;   cmap='Blues',

&#x20;   xticklabels=CLASS\_NAMES,

&#x20;   yticklabels=CLASS\_NAMES

)



plt.title(

&#x20;   'Hybrid PRPD-TF Confusion Matrix',

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



report = classification\_report(

&#x20;   y\_true,

&#x20;   y\_pred,

&#x20;   target\_names=CLASS\_NAMES

)



print(report)



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



for batch\_data, batch\_labels in test\_ds:



&#x20;   preds = model.predict(

&#x20;       batch\_data,

&#x20;       verbose=0

&#x20;   )



&#x20;   pred\_class = np.argmax(

&#x20;       preds,

&#x20;       axis=1

&#x20;   )



&#x20;   true\_class = np.argmax(

&#x20;       batch\_labels.numpy(),

&#x20;       axis=1

&#x20;   )



&#x20;   prpd\_imgs = batch\_data\['prpd\_input']

&#x20;   tf\_imgs = batch\_data\['tf\_input']



&#x20;   for i in range(len(pred\_class)):



&#x20;       if pred\_class\[i] != true\_class\[i]:



&#x20;           wrong\_count += 1



&#x20;           plt.figure(figsize=(10,4))



&#x20;           # -----------------------

&#x20;           # PRPD

&#x20;           # -----------------------

&#x20;           plt.subplot(1,2,1)



&#x20;           plt.imshow(

&#x20;               prpd\_imgs\[i]

&#x20;           )



&#x20;           plt.title(

&#x20;               f"PRPD\\nTrue: {CLASS\_NAMES\[true\_class\[i]]}\\nPred: {CLASS\_NAMES\[pred\_class\[i]]}"

&#x20;           )



&#x20;           plt.axis('off')



&#x20;           # -----------------------

&#x20;           # TF

&#x20;           # -----------------------

&#x20;           plt.subplot(1,2,2)



&#x20;           plt.imshow(

&#x20;               tf\_imgs\[i]

&#x20;           )



&#x20;           plt.title(

&#x20;               "TF MAP"

&#x20;           )



&#x20;           plt.axis('off')



&#x20;           plt.show()



print(f"\\n❌ Total Wrong Predictions : {wrong\_count}")



**PART 5 Real PD Classification Testing**

\# ==========================================

\# PRPD\_3\_Hybrid

\# PART 5 : REAL IMAGE PREDICTION

\# Upload PRPD + TF Together

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

model\_path = '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras'



model = tf.keras.models.load\_model(model\_path)



print("✅ PRPD\_3\_Hybrid model loaded!")



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

\# 5. UPLOAD PRPD + TF TOGETHER

\# ==========================================

print("\\n📥 Upload PRPD and TF Map images together")

print("⚠️ Upload exactly 2 images: 1 PRPD + 1 TF")



uploaded = files.upload()

uploaded\_files = list(uploaded.keys())



if len(uploaded\_files) != 2:

&#x20;   raise ValueError("❌ Please upload exactly 2 images: PRPD and TF")



\# ==========================================

\# 6. AUTO DETECT PRPD / TF

\# ==========================================

prpd\_path = None

tf\_path = None



for file\_name in uploaded\_files:



&#x20;   lower\_name = file\_name.lower()



&#x20;   if 'prpd' in lower\_name:

&#x20;       prpd\_path = file\_name



&#x20;   elif 'tf' in lower\_name:

&#x20;       tf\_path = file\_name



if prpd\_path is None:

&#x20;   raise ValueError("❌ PRPD image not found. File name must contain 'PRPD'.")



if tf\_path is None:

&#x20;   raise ValueError("❌ TF image not found. File name must contain 'TF'.")



print(f"\\n✅ PRPD : {prpd\_path}")

print(f"✅ TF   : {tf\_path}")



\# ==========================================

\# 7. PREPROCESS

\# ==========================================

prpd\_img = preprocess\_image(prpd\_path)

tf\_img = preprocess\_image(tf\_path)



prpd\_input = tf.expand\_dims(prpd\_img, axis=0)

tf\_input = tf.expand\_dims(tf\_img, axis=0)



\# ==========================================

\# 8. PREDICT

\# ==========================================

preds = model.predict(

&#x20;   {

&#x20;       'prpd\_input': prpd\_input,

&#x20;       'tf\_input': tf\_input

&#x20;   },

&#x20;   verbose=0

)\[0]



\# ==========================================

\# 9. SHOW IMAGES

\# ==========================================

plt.figure(figsize=(10, 4))



plt.subplot(1, 2, 1)

plt.imshow(image.load\_img(prpd\_path))

plt.title("PRPD Image")

plt.axis("off")



plt.subplot(1, 2, 2)

plt.imshow(image.load\_img(tf\_path))

plt.title("TF Map Image")

plt.axis("off")



plt.show()



\# ==========================================

\# 10. SHOW RESULT

\# ==========================================

print("\\n======================================")

print("📊 HYBRID PD ANALYSIS")

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

\# 11. FINAL RESULT

\# ==========================================

top\_idx = np.argmax(preds)

top\_class = CLASS\_NAMES\[top\_idx]

top\_score = preds\[top\_idx] \* 100



print("\\n======================================")

print(f"🔥 FINAL RESULT : {top\_class} ({top\_score:.2f}%)")

print("======================================")



\# ==========================================

\# 12. MIXED PD WARNING

\# ==========================================

sorted\_scores = np.sort(preds)\[::-1]



if sorted\_scores\[1] > 0.30:

&#x20;   print("\\n⚠️ Possible Mixed PD Detected")

&#x20;   print("Multiple PD types show significant probability")



**PART 6 AUTO-SWITCH INFERENCE**

\# ==========================================

\# PRPD\_3\_Hybrid

\# PART 6 : AUTO SWITCH INFERENCE

\# 1 image  = PRPD\_2\_Only

\# 2 images = PRPD\_3\_Hybrid

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

\# 2. MODEL PATHS

\# ==========================================

prpd\_only\_model\_path = '/content/drive/MyDrive/PRPD\_2\_Only\_best.keras'

hybrid\_model\_path    = '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras'



\# ==========================================

\# 3. LOAD MODELS

\# ==========================================

prpd\_model = tf.keras.models.load\_model(prpd\_only\_model\_path)

hybrid\_model = tf.keras.models.load\_model(hybrid\_model\_path)



print("✅ PRPD\_2\_Only model loaded")

print("✅ PRPD\_3\_Hybrid model loaded")



\# ==========================================

\# 4. CONFIG

\# ==========================================

CLASS\_NAMES = \['Corona', 'Surface', 'Internal']

IMG\_SIZE = 224



\# ==========================================

\# 5. PREPROCESS FUNCTION

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



\# ==========================================

\# 6. UPLOAD IMAGE

\# ==========================================

print("\\n📥 Upload image(s)")

print("• Upload 1 PRPD image = PRPD-only mode")

print("• Upload 2 images = Hybrid mode (PRPD + TF)")



uploaded = files.upload()

uploaded\_files = list(uploaded.keys())



if len(uploaded\_files) not in \[1, 2]:

&#x20;   raise ValueError("❌ Please upload either 1 PRPD image or 2 images: PRPD + TF")



\# ==========================================

\# 7. DETECT FILE TYPE

\# ==========================================

prpd\_path = None

tf\_path = None



for file\_name in uploaded\_files:

&#x20;   lower\_name = file\_name.lower()



&#x20;   if 'prpd' in lower\_name:

&#x20;       prpd\_path = file\_name



&#x20;   elif 'tf' in lower\_name:

&#x20;       tf\_path = file\_name



\# ถ้าอัปมา 1 รูป แต่ชื่อไม่มี PRPD ให้ถือว่าเป็น PRPD

if len(uploaded\_files) == 1 and prpd\_path is None:

&#x20;   prpd\_path = uploaded\_files\[0]



\# ==========================================

\# 8. AUTO SWITCH

\# ==========================================

if len(uploaded\_files) == 1:



&#x20;   if prpd\_path is None:

&#x20;       raise ValueError("❌ PRPD image not found")



&#x20;   print("\\n🔥 MODE : PRPD ONLY")

&#x20;   print("Using PRPD\_2\_Only model")



&#x20;   prpd\_img = preprocess\_image(prpd\_path)

&#x20;   prpd\_input = tf.expand\_dims(prpd\_img, axis=0)



&#x20;   preds = prpd\_model.predict(

&#x20;       prpd\_input,

&#x20;       verbose=0

&#x20;   )\[0]



&#x20;   plt.figure(figsize=(6, 6))

&#x20;   plt.imshow(image.load\_img(prpd\_path))

&#x20;   plt.title("PRPD Image")

&#x20;   plt.axis("off")

&#x20;   plt.show()



elif len(uploaded\_files) == 2:



&#x20;   if prpd\_path is None:

&#x20;       raise ValueError("❌ PRPD image not found. File name should contain 'PRPD'.")



&#x20;   if tf\_path is None:

&#x20;       raise ValueError("❌ TF image not found. File name should contain 'TF'.")



&#x20;   print("\\n🔥 MODE : HYBRID")

&#x20;   print("Using PRPD\_3\_Hybrid model")



&#x20;   prpd\_img = preprocess\_image(prpd\_path)

&#x20;   tf\_img = preprocess\_image(tf\_path)



&#x20;   prpd\_input = tf.expand\_dims(prpd\_img, axis=0)

&#x20;   tf\_input = tf.expand\_dims(tf\_img, axis=0)



&#x20;   preds = hybrid\_model.predict(

&#x20;       {

&#x20;           'prpd\_input': prpd\_input,

&#x20;           'tf\_input': tf\_input

&#x20;       },

&#x20;       verbose=0

&#x20;   )\[0]



&#x20;   plt.figure(figsize=(10, 4))



&#x20;   plt.subplot(1, 2, 1)

&#x20;   plt.imshow(image.load\_img(prpd\_path))

&#x20;   plt.title("PRPD Image")

&#x20;   plt.axis("off")



&#x20;   plt.subplot(1, 2, 2)

&#x20;   plt.imshow(image.load\_img(tf\_path))

&#x20;   plt.title("TF Map Image")

&#x20;   plt.axis("off")



&#x20;   plt.show()



\# ==========================================

\# 9. SHOW RESULT

\# ==========================================

print("\\n======================================")

print("📊 PD ANALYSIS RESULT")

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

\# 10. SMART FINAL RESULT

\# ต้องมี "เพียง 1 class"

\# ที่มากกว่า 85%

\# ==========================================



CONFIDENCE\_THRESHOLD = 85.0



\# เปลี่ยนเป็น %

scores\_percent = preds \* 100



\# หา class ที่เกิน threshold

high\_conf\_indices = np.where(

&#x20;   scores\_percent >= CONFIDENCE\_THRESHOLD

)\[0]



print("\\n======================================")



\# ==========================================

\# CASE 1 : มี class เดียวเกิน 85%

\# ==========================================

if len(high\_conf\_indices) == 1:



&#x20;   idx = high\_conf\_indices\[0]



&#x20;   final\_class = CLASS\_NAMES\[idx]



&#x20;   final\_score = scores\_percent\[idx]



&#x20;   print(

&#x20;       f"🔥 FINAL RESULT : "

&#x20;       f"{final\_class} "

&#x20;       f"({final\_score:.2f}%)"

&#x20;   )



\# ==========================================

\# CASE 2 : มีหลาย class เกิน 85%

\# ==========================================

elif len(high\_conf\_indices) > 1:



&#x20;   print("⚠️ FINAL RESULT : Mixed PD Suspected")



&#x20;   print(

&#x20;       "Multiple PD types exceed "

&#x20;       f"{CONFIDENCE\_THRESHOLD}%"

&#x20;   )



\# ==========================================

\# CASE 3 : ไม่มี class ไหนเกิน 85%

\# ==========================================

else:



&#x20;   print("⚠️ FINAL RESULT : Inconclusive")



&#x20;   print(

&#x20;       "No PD type exceeds "

&#x20;       f"{CONFIDENCE\_THRESHOLD}% confidence"

&#x20;   )



print("======================================")



**PART 5 Real PD Classification Testing (Non Idetified)**

\# ==========================================

\# PRPD\_3\_Hybrid

\# PART 5 : REAL IMAGE PREDICTION

\# Upload PRPD + TF Together

\# Auto Mount Google Drive

\# With Non-identified Bar

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

model\_path = '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras'



model = tf.keras.models.load\_model(model\_path)



print("✅ PRPD\_3\_Hybrid model loaded!")



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

\# 5. UPLOAD PRPD + TF TOGETHER

\# ==========================================

print("\\n📥 Upload PRPD and TF Map images together")

print("⚠️ Upload exactly 2 images: 1 PRPD + 1 TF")



uploaded = files.upload()

uploaded\_files = list(uploaded.keys())



if len(uploaded\_files) != 2:

&#x20;   raise ValueError(

&#x20;       "❌ Please upload exactly 2 images: PRPD and TF"

&#x20;   )



\# ==========================================

\# 6. AUTO DETECT PRPD / TF

\# ==========================================

prpd\_path = None

tf\_path = None



for file\_name in uploaded\_files:



&#x20;   lower\_name = file\_name.lower()



&#x20;   if 'prpd' in lower\_name:

&#x20;       prpd\_path = file\_name



&#x20;   elif 'tf' in lower\_name:

&#x20;       tf\_path = file\_name



if prpd\_path is None:

&#x20;   raise ValueError(

&#x20;       "❌ PRPD image not found. File name must contain 'PRPD'."

&#x20;   )



if tf\_path is None:

&#x20;   raise ValueError(

&#x20;       "❌ TF image not found. File name must contain 'TF'."

&#x20;   )



print(f"\\n✅ PRPD : {prpd\_path}")

print(f"✅ TF   : {tf\_path}")



\# ==========================================

\# 7. PREPROCESS

\# ==========================================

prpd\_img = preprocess\_image(prpd\_path)

tf\_img = preprocess\_image(tf\_path)



prpd\_input = tf.expand\_dims(prpd\_img, axis=0)

tf\_input = tf.expand\_dims(tf\_img, axis=0)



\# ==========================================

\# 8. PREDICT

\# ==========================================

preds = model.predict(

&#x20;   {

&#x20;       'prpd\_input': prpd\_input,

&#x20;       'tf\_input': tf\_input

&#x20;   },

&#x20;   verbose=0

)\[0]



\# ==========================================

\# 9. SHOW IMAGES

\# ==========================================

plt.figure(figsize=(10, 4))



plt.subplot(1, 2, 1)

plt.imshow(image.load\_img(prpd\_path))

plt.title("PRPD Image")

plt.axis("off")



plt.subplot(1, 2, 2)

plt.imshow(image.load\_img(tf\_path))

plt.title("TF Map Image")

plt.axis("off")



plt.show()



\# ==========================================

\# 10. ANALYSIS RESULT

\# ==========================================

scores\_percent = preds \* 100



top\_idx = np.argmax(scores\_percent)

top\_class = CLASS\_NAMES\[top\_idx]

top\_score = scores\_percent\[top\_idx]



high\_conf\_indices = np.where(

&#x20;   scores\_percent >= CONFIDENCE\_THRESHOLD

)\[0]



\# ==========================================

\# FINAL DECISION

\# ==========================================

if len(high\_conf\_indices) == 1:

&#x20;   final\_result = top\_class

&#x20;   final\_score = top\_score

&#x20;   status = "identified"

&#x20;   non\_identified\_percent = 0.0



else:

&#x20;   final\_result = "Non-identified"

&#x20;   final\_score = 100.0

&#x20;   status = "low\_confidence\_or\_mixed"



&#x20;   max\_score = np.max(scores\_percent)



&#x20;   non\_identified\_score = max(

&#x20;       0,

&#x20;       CONFIDENCE\_THRESHOLD - max\_score

&#x20;   )



&#x20;   non\_identified\_percent = (

&#x20;       non\_identified\_score /

&#x20;       CONFIDENCE\_THRESHOLD

&#x20;   ) \* 100



&#x20;   # ถ้ามีหลาย class เกิน threshold ให้ Non-ID เต็ม

&#x20;   if len(high\_conf\_indices) > 1:

&#x20;       non\_identified\_percent = 100.0



\# ==========================================

\# 11. SHOW RESULT

\# ==========================================

print("\\n======================================")

print("📊 HYBRID PD ANALYSIS")

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

\# 12. FINAL RESULT

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

&#x20;       "Expert interpretation is recommended "

&#x20;       "for further PD diagnosis."

&#x20;   )



else:



&#x20;   print(

&#x20;       f"🔥 FINAL RESULT : "

&#x20;       f"{final\_result} "

&#x20;       f"({final\_score:.2f}%)"

&#x20;   )



print("======================================")



**PART 6 AUTO-SWITCH INFERENCE (Non Idetified)**

\# ==========================================

\# PRPD\_3\_Hybrid

\# PART 6 : AUTO-SWITCH INFERENCE

\# Auto Detect PRPD-only or Hybrid Mode

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

\# 2. LOAD MODELS

\# ==========================================

prpd\_model\_path = '/content/drive/MyDrive/PRPD\_2\_Only\_best.keras'

hybrid\_model\_path = '/content/drive/MyDrive/PRPD\_TF\_1\_sigmoid\_best.keras'



prpd\_model = tf.keras.models.load\_model(prpd\_model\_path)

hybrid\_model = tf.keras.models.load\_model(hybrid\_model\_path)



print("✅ PRPD\_2\_Only model loaded!")

print("✅ PRPD\_3\_Hybrid model loaded!")



\# ==========================================

\# 3. CONFIG

\# ==========================================

CLASS\_NAMES = \['Corona', 'Surface', 'Internal']



IMG\_SIZE = 224

CONFIDENCE\_THRESHOLD = 85.0

INTERNAL\_HIGH\_CONFIDENCE = 95.0



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



\# ==========================================

\# 5. INTERNAL RULE CHECK

\# ใช้เฉพาะ PRPD-only mode

\# ==========================================

def internal\_sanity\_check\_from\_file(img\_path, debug=False):



&#x20;   raw = cv2.imread(img\_path)



&#x20;   if raw is None:

&#x20;       return False



&#x20;   raw = cv2.cvtColor(raw, cv2.COLOR\_BGR2RGB)



&#x20;   h, w, \_ = raw.shape



&#x20;   crop = raw\[

&#x20;       int(h \* 0.18):int(h \* 0.82),

&#x20;       int(w \* 0.18):int(w \* 0.88)

&#x20;   ]



&#x20;   gray = cv2.cvtColor(crop, cv2.COLOR\_RGB2GRAY)



&#x20;   dark\_mask = gray < 210



&#x20;   r = crop\[:, :, 0].astype(np.float32)

&#x20;   g = crop\[:, :, 1].astype(np.float32)

&#x20;   b = crop\[:, :, 2].astype(np.float32)



&#x20;   red\_mask = (

&#x20;       (r > 120) \&

&#x20;       (r > g \* 1.15) \&

&#x20;       (r > b \* 1.15)

&#x20;   )



&#x20;   mask = (dark\_mask | red\_mask).astype(np.uint8)



&#x20;   kernel = np.ones((2, 2), np.uint8)



&#x20;   mask = cv2.morphologyEx(

&#x20;       mask,

&#x20;       cv2.MORPH\_OPEN,

&#x20;       kernel

&#x20;   )



&#x20;   num\_labels, labels, stats, \_ = cv2.connectedComponentsWithStats(

&#x20;       mask,

&#x20;       connectivity=8

&#x20;   )



&#x20;   clean\_mask = np.zeros\_like(mask)



&#x20;   for i in range(1, num\_labels):



&#x20;       area = stats\[i, cv2.CC\_STAT\_AREA]

&#x20;       ww = stats\[i, cv2.CC\_STAT\_WIDTH]

&#x20;       hh = stats\[i, cv2.CC\_STAT\_HEIGHT]



&#x20;       very\_long\_horizontal = (ww > 120 and hh < 10)

&#x20;       very\_long\_vertical = (hh > 120 and ww < 10)

&#x20;       too\_small = area < 2

&#x20;       too\_large = area > 4000



&#x20;       if (

&#x20;           not very\_long\_horizontal and

&#x20;           not very\_long\_vertical and

&#x20;           not too\_small and

&#x20;           not too\_large

&#x20;       ):

&#x20;           clean\_mask\[labels == i] = 1



&#x20;   ch, cw = clean\_mask.shape



&#x20;   upper = np.sum(clean\_mask\[:ch//2, :])

&#x20;   lower = np.sum(clean\_mask\[ch//2:, :])



&#x20;   total = upper + lower + 1e-6



&#x20;   upper\_ratio = upper / total

&#x20;   lower\_ratio = lower / total



&#x20;   upper\_lower\_ok = (

&#x20;       upper\_ratio >= 0.15 and

&#x20;       lower\_ratio >= 0.15

&#x20;   )



&#x20;   internal\_ok = upper\_lower\_ok



&#x20;   if debug:

&#x20;       print("\\n🔎 INTERNAL RULE CHECK")

&#x20;       print(f"Upper ratio : {upper\_ratio:.2f}")

&#x20;       print(f"Lower ratio : {lower\_ratio:.2f}")

&#x20;       print(f"Internal OK : {internal\_ok}")



&#x20;   return internal\_ok



\# ==========================================

\# 6. UPLOAD FILES

\# ==========================================

print("\\n📥 Upload PRPD image")

print("📥 Optional : Upload TF Map together")



uploaded = files.upload()

uploaded\_files = list(uploaded.keys())



if len(uploaded\_files) == 0:

&#x20;   raise ValueError("❌ No files uploaded")



\# ==========================================

\# 7. AUTO DETECT FILES

\# ==========================================

prpd\_path = None

tf\_path = None



for file\_name in uploaded\_files:



&#x20;   lower\_name = file\_name.lower()



&#x20;   if 'prpd' in lower\_name:

&#x20;       prpd\_path = file\_name



&#x20;   elif 'tf' in lower\_name:

&#x20;       tf\_path = file\_name



if prpd\_path is None:

&#x20;   raise ValueError("❌ PRPD image not found. File name must contain 'PRPD'.")



\# ==========================================

\# 8. AUTO SWITCH MODE

\# ==========================================

if tf\_path is not None:

&#x20;   MODE = "HYBRID"

else:

&#x20;   MODE = "PRPD\_ONLY"



print(f"\\n🔥 MODE : {MODE}")



\# ==========================================

\# 9. PREPROCESS

\# ==========================================

prpd\_img = preprocess\_image(prpd\_path)

prpd\_input = tf.expand\_dims(prpd\_img, axis=0)



\# ==========================================

\# 10. PREDICT

\# ==========================================

if MODE == "HYBRID":



&#x20;   tf\_img = preprocess\_image(tf\_path)

&#x20;   tf\_input = tf.expand\_dims(tf\_img, axis=0)



&#x20;   preds = hybrid\_model.predict(

&#x20;       {

&#x20;           'prpd\_input': prpd\_input,

&#x20;           'tf\_input': tf\_input

&#x20;       },

&#x20;       verbose=0

&#x20;   )\[0]



else:



&#x20;   preds = prpd\_model.predict(

&#x20;       prpd\_input,

&#x20;       verbose=0

&#x20;   )\[0]



\# ==========================================

\# 11. SHOW IMAGE

\# ==========================================

if MODE == "HYBRID":



&#x20;   plt.figure(figsize=(10, 4))



&#x20;   plt.subplot(1, 2, 1)

&#x20;   plt.imshow(image.load\_img(prpd\_path))

&#x20;   plt.title("PRPD Image")

&#x20;   plt.axis("off")



&#x20;   plt.subplot(1, 2, 2)

&#x20;   plt.imshow(image.load\_img(tf\_path))

&#x20;   plt.title("TF Map Image")

&#x20;   plt.axis("off")



&#x20;   plt.show()



else:



&#x20;   plt.figure(figsize=(6, 6))

&#x20;   plt.imshow(image.load\_img(prpd\_path))

&#x20;   plt.title("PRPD Image")

&#x20;   plt.axis("off")

&#x20;   plt.show()



\# ==========================================

\# 12. ANALYSIS RESULT

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

\# 13. INTERNAL SAFETY RULE

\# ใช้เฉพาะ PRPD\_ONLY

\# ==========================================

if MODE == "PRPD\_ONLY":



&#x20;   if top\_class == "Internal" and top\_score >= CONFIDENCE\_THRESHOLD:



&#x20;       # ถ้า Internal มั่นใจสูงมาก ให้ผ่าน

&#x20;       # แต่แนะนำให้ใช้ TF Map ยืนยัน

&#x20;       if top\_score >= INTERNAL\_HIGH\_CONFIDENCE:



&#x20;           status = "identified\_with\_tf\_recommendation"



&#x20;       # ถ้ามั่นใจระดับกลาง ค่อยใช้ rule check

&#x20;       else:



&#x20;           internal\_ok = internal\_sanity\_check\_from\_file(

&#x20;               prpd\_path,

&#x20;               debug=True

&#x20;           )



&#x20;           if not internal\_ok:



&#x20;               final\_result = "Non-identified"

&#x20;               final\_score = 100.0

&#x20;               status = "rule\_rejected\_internal"

&#x20;               rule\_rejected = True



\# ==========================================

\# 14. CONFIDENCE CHECK

\# ==========================================

high\_conf\_indices = np.where(

&#x20;   scores\_percent >= CONFIDENCE\_THRESHOLD

)\[0]



if len(high\_conf\_indices) != 1:



&#x20;   final\_result = "Non-identified"

&#x20;   final\_score = 100.0

&#x20;   status = "low\_confidence\_or\_mixed"



\# ==========================================

\# 15. NON-IDENTIFIED SCORE

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



&#x20;       if len(high\_conf\_indices) > 1:

&#x20;           non\_identified\_percent = 100.0



else:



&#x20;   non\_identified\_percent = 0.0



\# ==========================================

\# 16. SHOW RESULT

\# ==========================================

print("\\n======================================")



if MODE == "HYBRID":

&#x20;   print("📊 HYBRID PD ANALYSIS")

else:

&#x20;   print("📊 PRPD-ONLY ANALYSIS")



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

\# 17. FINAL RESULT

\# ==========================================

print("\\n======================================")



if final\_result == "Non-identified":



&#x20;   print(

&#x20;       f"⚠️ FINAL RESULT : "

&#x20;       f"Non-identified "

&#x20;       f"({non\_identified\_percent:.2f}%)"

&#x20;   )



&#x20;   print(

&#x20;       f"Reason : {status}"

&#x20;   )



&#x20;   if MODE == "PRPD\_ONLY":



&#x20;       print(

&#x20;           "Recommendation : "

&#x20;           "TF Map analysis is required "

&#x20;           "for further PD interpretation."

&#x20;       )



&#x20;   else:



&#x20;       print(

&#x20;           "Recommendation : "

&#x20;           "Expert interpretation is recommended "

&#x20;           "for further PD diagnosis."

&#x20;       )



else:



&#x20;   print(

&#x20;       f"🔥 FINAL RESULT : "

&#x20;       f"{final\_result} "

&#x20;       f"({final\_score:.2f}%)"

&#x20;   )



&#x20;   if status == "identified\_with\_tf\_recommendation":



&#x20;       print(

&#x20;           "Recommendation : "

&#x20;           "TF Map analysis is recommended "

&#x20;           "to confirm the Internal PD interpretation."

&#x20;       )



print("======================================")



