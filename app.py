import streamlit as st

st.title('나의 첫 웹서비스 만들기!!')
name=st.text_input('이름을 입력하세요: ')
menu=st.selectbox('좋아하는 음식을 선택하세요: ',['떡볶이,치즈볼'])
if st.button('인삿말 생성'):
  st.write(f'{name}님 당신이 좋아하는 음식은 {menu}군요)
  st.snow()

