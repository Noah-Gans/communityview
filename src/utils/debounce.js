export function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      console.log(`Debounced function called. Waiting ${delay} ms before executing...`);
  
      if (timeoutId) {
        console.log('Previous debounce call detected. Clearing the timeout and resetting...');
        clearTimeout(timeoutId);
      }
  
      timeoutId = setTimeout(() => {
        console.log('Debounce delay passed. Executing the function now.');
        func(...args);
      }, delay);
    };
  }
  