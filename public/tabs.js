document.querySelectorAll('.audience-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.audience-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.audience-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
  });
});
