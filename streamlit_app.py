import streamlit as st

st.set_page_config(
    page_title="Focus App",
    page_icon="🧠",
    layout="centered"
)

st.title("Focus App")
st.subheader("Your AI focus companion")

goal = st.text_input(
    "What are you focusing on today?",
    placeholder="Biology finals — Chapter 7"
)

duration = st.slider(
    "Session duration (minutes)",
    15,
    120,
    45
)

if st.button("Start Session"):
    st.success(f"Session started for {duration} minutes!")
    st.write("Stay focused. One session at a time.")

st.divider()

st.caption("Built for students trying to beat distraction.")
